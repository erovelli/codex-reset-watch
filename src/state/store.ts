import type {
  MonitorState,
  NotificationStatus,
  RateLimitWindow,
  ResetEventRecord,
  UsageSnapshot,
  WindowState
} from "../types.js";
import { atomicWriteJson, readJsonFile } from "./json-store.js";

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function finiteNumber(raw: Record<string, unknown>, field: string, path: string, minimum = 0): number {
  const value = raw[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${path}.${field} must be a finite number of at least ${minimum}`);
  }
  return value;
}

function optionalNumber(raw: Record<string, unknown>, field: string, path: string, minimum = 0): number | undefined {
  return raw[field] === undefined ? undefined : finiteNumber(raw, field, path, minimum);
}

function string(raw: Record<string, unknown>, field: string, path: string, maximum = 1024): string {
  const value = raw[field];
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new Error(`${path}.${field} must be a non-empty string no longer than ${maximum} characters`);
  }
  return value;
}

function optionalString(raw: Record<string, unknown>, field: string, path: string, maximum = 4096): string | undefined {
  return raw[field] === undefined ? undefined : string(raw, field, path, maximum);
}

function resetEvent(value: unknown, path: string): ResetEventRecord {
  const raw = record(value, path);
  const kind = raw.kind;
  if (kind !== "scheduled" && kind !== "unexpected") throw new Error(`${path}.kind is invalid`);
  const notificationStatus = raw.notificationStatus;
  const statuses = new Set<NotificationStatus>(["sent", "not-requested", "sending", "failed"]);
  if (typeof notificationStatus !== "string" || !statuses.has(notificationStatus as NotificationStatus)) {
    throw new Error(`${path}.notificationStatus is invalid`);
  }
  const notificationError = optionalString(raw, "notificationError", path);
  const providerMessageId = optionalString(raw, "providerMessageId", path);
  return {
    id: string(raw, "id", path, 256),
    kind,
    detectedAt: finiteNumber(raw, "detectedAt", path),
    expectedResetAt: finiteNumber(raw, "expectedResetAt", path),
    observedResetAt: finiteNumber(raw, "observedResetAt", path),
    peakUsedPercent: finiteNumber(raw, "peakUsedPercent", path),
    notificationStatus: notificationStatus as NotificationStatus,
    ...(notificationError === undefined ? {} : { notificationError }),
    ...(providerMessageId === undefined ? {} : { providerMessageId })
  };
}

function windowState(value: unknown, path: string): WindowState {
  const raw = record(value, path);
  const currentWindowStartedAt = optionalNumber(raw, "currentWindowStartedAt", path);
  return {
    expectedResetAt: finiteNumber(raw, "expectedResetAt", path),
    previousObservedResetAt: finiteNumber(raw, "previousObservedResetAt", path),
    lastObservedAt: finiteNumber(raw, "lastObservedAt", path),
    lastUsedPercent: finiteNumber(raw, "lastUsedPercent", path),
    peakUsedPercent: finiteNumber(raw, "peakUsedPercent", path),
    ...(currentWindowStartedAt === undefined ? {} : { currentWindowStartedAt }),
    ...(raw.lastResetEvent === undefined ? {} : { lastResetEvent: resetEvent(raw.lastResetEvent, `${path}.lastResetEvent`) })
  };
}

function rateLimitWindow(value: unknown, path: string): RateLimitWindow {
  const raw = record(value, path);
  const limitName = optionalString(raw, "limitName", path);
  return {
    key: string(raw, "key", path),
    limitId: string(raw, "limitId", path),
    ...(limitName === undefined ? {} : { limitName }),
    windowKind: string(raw, "windowKind", path),
    usedPercent: finiteNumber(raw, "usedPercent", path),
    windowDurationMins: finiteNumber(raw, "windowDurationMins", path, Number.EPSILON),
    resetsAt: finiteNumber(raw, "resetsAt", path, Number.EPSILON)
  };
}

function snapshot(value: unknown, path: string): UsageSnapshot {
  const raw = record(value, path);
  if (!Array.isArray(raw.windows) || raw.windows.length > 1000) {
    throw new Error(`${path}.windows must be an array with at most 1000 entries`);
  }
  return {
    observedAt: finiteNumber(raw, "observedAt", path),
    accountType: string(raw, "accountType", path, 256),
    windows: raw.windows.map((window, index) => rateLimitWindow(window, `${path}.windows[${index}]`))
  };
}

export function validateState(value: unknown): MonitorState {
  const raw = record(value, "State file");
  if (raw.schemaVersion !== 1) throw new Error(`Unsupported state schema: ${String(raw.schemaVersion)}`);
  const rawWindows = record(raw.windows, "State file.windows");
  const entries = Object.entries(rawWindows);
  if (entries.length > 1000) throw new Error("State file.windows contains too many entries");
  const windows = Object.fromEntries(entries.map(([key, state]) => {
    if (key.length === 0 || key.length > 1024) throw new Error("State file.windows contains an invalid key");
    return [key, windowState(state, `State file.windows.${key}`)];
  }));
  const lastSuccessfulCheck = optionalNumber(raw, "lastSuccessfulCheck", "State file");
  const lastCheckAttempt = optionalNumber(raw, "lastCheckAttempt", "State file");
  const lastCheckError = optionalString(raw, "lastCheckError", "State file");
  return {
    schemaVersion: 1,
    windows,
    ...(lastSuccessfulCheck === undefined ? {} : { lastSuccessfulCheck }),
    ...(lastCheckAttempt === undefined ? {} : { lastCheckAttempt }),
    ...(lastCheckError === undefined ? {} : { lastCheckError }),
    ...(raw.lastSnapshot === undefined ? {} : { lastSnapshot: snapshot(raw.lastSnapshot, "State file.lastSnapshot") })
  };
}

export function emptyState(): MonitorState {
  return { schemaVersion: 1, windows: {} };
}

export async function loadState(path: string): Promise<MonitorState> {
  const value = await readJsonFile<unknown>(path);
  return value === undefined ? emptyState() : validateState(value);
}

export async function saveState(path: string, state: MonitorState): Promise<void> {
  await atomicWriteJson(path, validateState(state));
}
