import type { RateLimitWindow } from "../types.js";

export function localTime(timestamp: number | undefined): string {
  return timestamp ? new Date(timestamp * 1000).toLocaleString() : "unknown";
}

export function describeWindow(window: RateLimitWindow): string {
  const duration = window.windowDurationMins === 10_080
    ? "weekly"
    : `${window.windowDurationMins} min`;
  return `${window.key}${window.limitName ? ` (${window.limitName})` : ""}: ${duration}, ${window.usedPercent.toFixed(1)}% used, resets ${localTime(window.resetsAt)}`;
}
