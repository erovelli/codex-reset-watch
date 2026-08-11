import type { ResetEvent } from "../types.js";

function duration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.max(0, Math.floor((seconds % 3600) / 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function buildResetMessage(event: ResetEvent, includeSmsOptOut = true): string {
  const label = Math.abs(event.windowDurationMins - 10_080) <= 120
    ? "WEEKLY"
    : event.windowKind.toUpperCase().slice(0, 16);
  const peak = Math.round(event.peakUsedPercent);
  if (event.kind === "unexpected") {
    return `Codex Reset Watch: ${label} unexpected reset. Peak observed use ${peak}%. Reset ${duration(event.earlyBySeconds ?? 0)} early.${includeSmsOptOut ? " Reply STOP to unsubscribe." : ""}`;
  }
  return `Codex Reset Watch: ${label} scheduled reset. Peak observed use ${peak}%.${includeSmsOptOut ? " Reply STOP to unsubscribe." : ""}`;
}
