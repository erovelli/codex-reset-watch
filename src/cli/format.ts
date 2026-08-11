import type { RateLimitWindow } from "../types.js";

export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10 && digits[0] !== "0") return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+") && /^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  throw new Error("Enter an E.164 number (for example +15551234567) or a 10-digit US/Canada number.");
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `+${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function localTime(timestamp: number | undefined): string {
  return timestamp ? new Date(timestamp * 1000).toLocaleString() : "unknown";
}

export function describeWindow(window: RateLimitWindow): string {
  const duration = window.windowDurationMins === 10_080
    ? "weekly"
    : `${window.windowDurationMins} min`;
  return `${window.key}${window.limitName ? ` (${window.limitName})` : ""}: ${duration}, ${window.usedPercent.toFixed(1)}% used, resets ${localTime(window.resetsAt)}`;
}
