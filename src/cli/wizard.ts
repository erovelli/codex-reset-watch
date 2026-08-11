import type { MonitorConfig, MonitorState, RateLimitWindow, UsageSnapshot } from "../types.js";
import { evaluateWindow, isWeeklyWindow } from "../detection/detector.js";
import { normalizePhone, describeWindow } from "./format.js";
import { Prompt } from "./prompt.js";

export interface ChosenSettings {
  phone: string;
  pollingIntervalMins: number;
  gracePeriodMins: number;
  notifyUnexpected: boolean;
  notifyScheduled: boolean;
  monitoredWindowKeys: string[];
  acceptedSmsTermsAt: number;
}

export function explainSms(): void {
  console.log(`
SMS behavior
  Codex Reset Watch uses Textbelt's free hosted HTTPS endpoint and public "textbelt" key.
  Textbelt currently permits one free SMS per day; no paid key or credits are needed.
  That third-party policy can change, and delivery is best effort.
  Scheduled reset texts are off by default because one could consume the day's free SMS and
  prevent a later unexpected-reset alert. Only notify a phone you own/control or have explicit
  permission to notify. Alerts identify Codex Reset Watch and say "Reply STOP to unsubscribe."
  Textbelt handles STOP replies; only the recipient can opt back in by replying START.
`);
}

async function phonePrompt(prompt: Prompt, existing?: string): Promise<string> {
  while (true) {
    const answer = await prompt.ask("Phone number (E.164 preferred)", existing);
    try { return normalizePhone(answer); } catch (error) { console.log((error as Error).message); }
  }
}

async function numberPrompt(prompt: Prompt, label: string, current: number, min: number, max: number): Promise<number> {
  while (true) {
    const value = Number(await prompt.ask(label, String(current)));
    if (Number.isFinite(value) && value >= min && value <= max) return Math.round(value);
    console.log(`Enter a number from ${min} to ${max}.`);
  }
}

async function chooseWindows(prompt: Prompt, windows: RateLimitWindow[], selected?: string[]): Promise<string[]> {
  console.log("\nDiscovered Codex rate-limit windows:");
  windows.forEach((window, index) => console.log(`  ${index + 1}) ${describeWindow(window)}${isWeeklyWindow(window) ? " [weekly]" : ""}`));
  const defaults = windows
    .map((window, index) => (selected?.includes(window.key) || (!selected && isWeeklyWindow(window))) ? index + 1 : 0)
    .filter(Boolean)
    .join(",");
  while (true) {
    const raw = await prompt.ask("Windows to monitor (comma-separated numbers)", defaults);
    const indexes = [...new Set(raw.split(",").map((part) => Number(part.trim()) - 1))];
    if (indexes.length > 0 && indexes.every((index) => Number.isInteger(index) && index >= 0 && index < windows.length)) {
      return indexes.map((index) => windows[index]?.key).filter((key): key is string => Boolean(key));
    }
    console.log("Select at least one listed window.");
  }
}

export async function installChoices(prompt: Prompt): Promise<{ phone: string; customize: boolean; acceptedSmsTermsAt: number }> {
  explainSms();
  if (!await prompt.confirm("I understand and have permission to notify this number", false)) {
    throw new Error("SMS terms were not acknowledged; installation cancelled");
  }
  const phone = await phonePrompt(prompt);
  const customize = await prompt.choose("Settings", ["Use recommended defaults", "Customize settings"], 0) === 1;
  return { phone, customize, acceptedSmsTermsAt: Math.floor(Date.now() / 1000) };
}

export async function settingsFromSnapshot(
  prompt: Prompt,
  snapshot: UsageSnapshot,
  base: { phone: string; acceptedSmsTermsAt: number },
  customize: boolean,
  existing?: MonitorConfig
): Promise<ChosenSettings> {
  const weekly = snapshot.windows.filter(isWeeklyWindow).map((window) => window.key);
  if (!customize && weekly.length === 0) {
    throw new Error("Codex did not report an approximately seven-day window. Choose custom settings after one is available.");
  }
  if (!customize) {
    return {
      ...base,
      pollingIntervalMins: 30,
      gracePeriodMins: 60,
      notifyUnexpected: true,
      notifyScheduled: false,
      monitoredWindowKeys: weekly
    };
  }
  const monitoredWindowKeys = await chooseWindows(prompt, snapshot.windows, existing?.monitoredWindowKeys);
  const pollingIntervalMins = await numberPrompt(prompt, "Polling interval (minutes)", existing?.pollingIntervalMins ?? 30, 5, 1440);
  if (pollingIntervalMins > 120) console.log("Warning: long polling intervals make early-reset classification less reliable.");
  const gracePeriodMins = await numberPrompt(prompt, "Scheduled-reset grace period (minutes)", existing?.gracePeriodMins ?? 60, 0, 1440);
  const channel = existing?.provider === "web-push" ? "notification" : "SMS";
  const notifyUnexpected = await prompt.confirm(`Send unexpected-reset ${channel}`, existing?.notifyUnexpected ?? true);
  const notifyScheduled = await prompt.confirm(`Send scheduled-reset ${channel}`, existing?.notifyScheduled ?? false);
  if (notifyScheduled && existing?.provider !== "web-push") {
    console.log("Warning: a scheduled reset text may consume Textbelt's one free message for that day and prevent an unexpected-reset alert later the same day.");
  }
  return { ...base, monitoredWindowKeys, pollingIntervalMins, gracePeriodMins, notifyUnexpected, notifyScheduled };
}

export async function configureChoices(prompt: Prompt, snapshot: UsageSnapshot, existing: MonitorConfig): Promise<ChosenSettings> {
  let phone = existing.phone;
  if (existing.provider === "web-push") {
    console.log("\nNotification provider: iOS Web Push (paired device retained).\nRun `codex-reset-watch setup-web-push` to pair a different iPhone.\n");
  } else {
    explainSms();
    phone = await phonePrompt(prompt, existing.phone);
  }
  return settingsFromSnapshot(
    prompt,
    snapshot,
    { phone, acceptedSmsTermsAt: existing.acceptedSmsTermsAt },
    true,
    existing
  );
}

export function baselineState(snapshot: UsageSnapshot, monitored: string[], existing?: MonitorState): MonitorState {
  const state: MonitorState = existing ?? { schemaVersion: 1, windows: {} };
  for (const window of snapshot.windows) {
    if (!monitored.includes(window.key) || state.windows[window.key]) continue;
    state.windows[window.key] = evaluateWindow(undefined, window, {
      observedAt: snapshot.observedAt,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    }).nextState;
  }
  state.lastSnapshot = snapshot;
  state.lastSuccessfulCheck = snapshot.observedAt;
  delete state.lastCheckError;
  return state;
}
