import { createHash } from "node:crypto";
import type { RateLimitWindow, ResetEvent, WindowState } from "../types.js";

export interface DetectorOptions {
  observedAt: number;
  gracePeriodMins: number;
  pollingIntervalMins: number;
}

export interface DetectionResult {
  nextState: WindowState;
  event?: ResetEvent;
  scheduleChanged: boolean;
  reason: string;
}

function inferredStart(window: RateLimitWindow): number {
  return window.resetsAt - window.windowDurationMins * 60;
}

function eventId(window: RateLimitWindow, resetAt: number): string {
  const rounded = Math.round(resetAt / 60) * 60;
  return createHash("sha256")
    .update(`${window.key}|${window.windowDurationMins}|${rounded}`)
    .digest("hex")
    .slice(0, 24);
}

export function evaluateWindow(
  previous: WindowState | undefined,
  current: RateLimitWindow,
  options: DetectorOptions
): DetectionResult {
  const currentStart = inferredStart(current);
  if (!previous) {
    return {
      nextState: {
        expectedResetAt: current.resetsAt,
        previousObservedResetAt: current.resetsAt,
        lastObservedAt: options.observedAt,
        lastUsedPercent: current.usedPercent,
        peakUsedPercent: current.usedPercent,
        currentWindowStartedAt: currentStart
      },
      scheduleChanged: false,
      reason: "first-observation"
    };
  }

  // All reset evidence and classification below intentionally use the immutable previous state.
  const oldExpectedResetAt = previous.expectedResetAt;
  const scheduleChanged = Math.abs(current.resetsAt - oldExpectedResetAt) > 60;
  const boundaryAdvanced = current.resetsAt > previous.previousObservedResetAt + 60;
  const usageDrop = previous.lastUsedPercent - current.usedPercent;
  const nearZero = current.usedPercent <= 1 && previous.lastUsedPercent > current.usedPercent;
  const boundaryUsageSignature =
    usageDrop >= 3 && current.usedPercent <= Math.max(5, previous.lastUsedPercent * 0.5);
  const strongUsageOnlySignature = nearZero && usageDrop >= 10 && previous.peakUsedPercent >= 10;
  const resetDetected = (boundaryAdvanced && (nearZero || boundaryUsageSignature)) || strongUsageOnlySignature;
  const startNearObservation =
    Math.abs(currentStart - options.observedAt) <=
    Math.max(45 * 60, Math.ceil(options.pollingIntervalMins * 1.5) * 60);
  const recentSample =
    options.observedAt - previous.lastObservedAt <=
    Math.max(30 * 60, (options.pollingIntervalMins * 2 + 5) * 60);

  if (!resetDetected) {
    return {
      nextState: {
        ...previous,
        expectedResetAt: current.resetsAt,
        previousObservedResetAt: current.resetsAt,
        lastObservedAt: options.observedAt,
        lastUsedPercent: current.usedPercent,
        peakUsedPercent: Math.max(previous.peakUsedPercent, current.usedPercent)
      },
      scheduleChanged,
      reason: scheduleChanged ? "advertised-reset-changed" : "no-reset-signature"
    };
  }

  const observedResetAt = boundaryAdvanced ? currentStart : options.observedAt;
  const graceSeconds = options.gracePeriodMins * 60;
  const clearlyEarly = observedResetAt < oldExpectedResetAt - graceSeconds;
  const earlyEvidence = boundaryAdvanced
    ? startNearObservation && recentSample
    : strongUsageOnlySignature && recentSample;
  const kind: "scheduled" | "unexpected" = clearlyEarly && earlyEvidence ? "unexpected" : "scheduled";
  const id = eventId(current, observedResetAt);

  if (previous.lastResetEvent?.id === id) {
    return {
      nextState: {
        ...previous,
        expectedResetAt: current.resetsAt,
        previousObservedResetAt: current.resetsAt,
        lastObservedAt: options.observedAt,
        lastUsedPercent: current.usedPercent,
        peakUsedPercent: Math.max(previous.peakUsedPercent, current.usedPercent)
      },
      scheduleChanged,
      reason: "duplicate-reset-event"
    };
  }

  const record = {
    id,
    kind,
    detectedAt: options.observedAt,
    expectedResetAt: oldExpectedResetAt,
    observedResetAt,
    peakUsedPercent: previous.peakUsedPercent,
    notificationStatus: "not-requested" as const
  };
  const event: ResetEvent = {
    ...record,
    windowKey: current.key,
    limitId: current.limitId,
    ...(current.limitName === undefined ? {} : { limitName: current.limitName }),
    windowKind: current.windowKind,
    windowDurationMins: current.windowDurationMins,
    ...(kind === "unexpected"
      ? { earlyBySeconds: Math.max(0, oldExpectedResetAt - observedResetAt) }
      : {})
  };

  return {
    nextState: {
      expectedResetAt: current.resetsAt,
      previousObservedResetAt: current.resetsAt,
      lastObservedAt: options.observedAt,
      lastUsedPercent: current.usedPercent,
      peakUsedPercent: current.usedPercent,
      currentWindowStartedAt: currentStart,
      lastResetEvent: record
    },
    event,
    scheduleChanged,
    reason: kind === "unexpected" ? "strong-early-reset" : "reset-near-schedule-or-ambiguous"
  };
}

export function isWeeklyWindow(window: RateLimitWindow): boolean {
  return Math.abs(window.windowDurationMins - 10_080) <= 120;
}
