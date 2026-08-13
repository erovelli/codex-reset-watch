import type {
  MonitorConfig,
  MonitorState,
  NotificationProvider,
  NotificationRecipient,
  ResetEvent,
  UsageSource
} from "../types.js";
import { evaluateWindow } from "../detection/detector.js";
import { buildResetMessage } from "../notifications/messages.js";
import { sendWithRetry, type RetryOptions } from "../notifications/retry.js";
import { saveState } from "../state/store.js";
import { acquireLock } from "./lock.js";
import type { Logger } from "../utils/logger.js";

export interface CheckDependencies {
  source: UsageSource;
  provider: NotificationProvider;
  recipients: NotificationRecipient[];
  state: MonitorState;
  statePath: string;
  lockPath: string;
  logger: Logger;
  retryOptions?: RetryOptions;
}

function notificationRequested(event: ResetEvent, config: MonitorConfig): boolean {
  return event.kind === "unexpected" ? config.notifyUnexpected : config.notifyScheduled;
}

export async function runCheck(config: MonitorConfig, dependencies: CheckDependencies): Promise<MonitorState> {
  const lock = await acquireLock(dependencies.lockPath);
  if (!lock) throw new Error("Another Codex Reset Watch check is already running");
  const state = dependencies.state;
  state.lastCheckAttempt = Math.floor(Date.now() / 1000);
  await dependencies.logger.log("info", "check started");
  try {
    let snapshot;
    try {
      snapshot = await dependencies.source.read();
    } catch (error) {
      state.lastCheckError = error instanceof Error ? error.message : String(error);
      await saveState(dependencies.statePath, state);
      await dependencies.logger.log("error", `Codex query failed: ${state.lastCheckError}`);
      throw error;
    }

    const events: ResetEvent[] = [];
    const byKey = new Map(snapshot.windows.map((window) => [window.key, window]));
    for (const key of config.monitoredWindowKeys) {
      const current = byKey.get(key);
      if (!current) {
        await dependencies.logger.log("warn", `monitored bucket missing: ${key}`);
        continue;
      }
      const result = evaluateWindow(state.windows[key], current, {
        observedAt: snapshot.observedAt,
        gracePeriodMins: config.gracePeriodMins,
        pollingIntervalMins: config.pollingIntervalMins
      });
      state.windows[key] = result.nextState;
      if (result.scheduleChanged) await dependencies.logger.log("info", `advertised reset changed: ${key}`);
      if (result.event) {
        events.push(result.event);
        await dependencies.logger.log("info", `reset classified ${result.event.kind}: ${key} event=${result.event.id}`);
      }
    }
    state.lastSnapshot = snapshot;
    state.lastSuccessfulCheck = snapshot.observedAt;
    delete state.lastCheckError;

    // Persist detection before any network request. A crash after this point will not resend the event.
    await saveState(dependencies.statePath, state);
    events.sort((a, b) => Number(b.kind === "unexpected") - Number(a.kind === "unexpected"));
    for (const event of events) {
      if (!notificationRequested(event, config)) continue;
      const windowState = state.windows[event.windowKey];
      if (!windowState?.lastResetEvent || windowState.lastResetEvent.id !== event.id) continue;
      windowState.lastResetEvent.notificationStatus = "sending";
      await saveState(dependencies.statePath, state);
      await dependencies.logger.log("info", `notification attempt via ${dependencies.provider.id}: event=${event.id}`);
      const result = await sendWithRetry(
        dependencies.provider,
        { id: event.id, message: buildResetMessage(event) },
        dependencies.recipients,
        dependencies.retryOptions
      );
      windowState.lastResetEvent.notificationStatus = result.status;
      if (result.error) windowState.lastResetEvent.notificationError = result.error;
      else delete windowState.lastResetEvent.notificationError;
      if (result.providerMessageId) windowState.lastResetEvent.providerMessageId = result.providerMessageId;
      await saveState(dependencies.statePath, state);
      await dependencies.logger.log(result.status === "sent" ? "info" : "warn", `notification result ${result.status}: event=${event.id}${result.error ? ` ${result.error}` : ""}`);
    }
    await dependencies.logger.log("info", "check completed");
    return state;
  } finally {
    await lock.release();
  }
}
