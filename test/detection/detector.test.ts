import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateWindow } from "../../src/detection/detector.js";
import type { RateLimitWindow, WindowState } from "../../src/types.js";

const HOUR = 3600;
const WEEK = 7 * 24 * HOUR;
const key = "codex:secondary";
const at = 1_800_000_000;

function window(usedPercent: number, resetsAt: number, duration = 10_080): RateLimitWindow {
  return { key, limitId: "codex", windowKind: "secondary", usedPercent, windowDurationMins: duration, resetsAt };
}

function baseline(usedPercent = 30, resetsAt = at + 4 * 24 * HOUR, observedAt = at): WindowState {
  return evaluateWindow(undefined, window(usedPercent, resetsAt), {
    observedAt,
    gracePeriodMins: 60,
    pollingIntervalMins: 30
  }).nextState;
}

describe("reset detector", () => {
  it("uses the first observation only as a baseline", () => {
    const result = evaluateWindow(undefined, window(30, at + WEEK), {
      observedAt: at,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.equal(result.event, undefined);
    assert.equal(result.nextState.peakUsedPercent, 30);
  });

  it("ignores ordinary usage growth", () => {
    const previous = baseline(30);
    const result = evaluateWindow(previous, window(40, previous.expectedResetAt), {
      observedAt: at + 1800,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.equal(result.event, undefined);
    assert.equal(result.nextState.peakUsedPercent, 40);
  });

  it("classifies an ordinary weekly reset as scheduled", () => {
    const expected = at + HOUR;
    const previous = baseline(90, expected, at);
    const observedAt = expected + 10 * 60;
    const result = evaluateWindow(previous, window(0, observedAt + WEEK), {
      observedAt,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.equal(result.event?.kind, "scheduled");
    assert.equal(result.event?.peakUsedPercent, 90);
  });

  it("classifies a strongly indicated early weekly reset as unexpected", () => {
    const expected = at + 2 * 24 * HOUR;
    const previous = baseline(90, expected, at);
    const observedAt = at + 30 * 60;
    const result = evaluateWindow(previous, window(0, observedAt + WEEK), {
      observedAt,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.equal(result.event?.kind, "unexpected");
    assert.ok((result.event?.earlyBySeconds ?? 0) > 24 * HOUR);
  });

  it("detects a low-utilization early reset when a fresh boundary corroborates it", () => {
    const expected = at + 3 * 24 * HOUR;
    const previous = baseline(6, expected, at);
    const observedAt = at + 20 * 60;
    const result = evaluateWindow(previous, window(0, observedAt + WEEK), {
      observedAt,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.equal(result.event?.kind, "unexpected");
    assert.equal(result.event?.peakUsedPercent, 6);
  });

  it("ignores a usage drop without sufficient reset evidence", () => {
    const previous = baseline(30);
    const result = evaluateWindow(previous, window(20, previous.expectedResetAt), {
      observedAt: at + 1800,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.equal(result.event, undefined);
  });

  it("accepts a strong recent utilization reset even when resetsAt does not change", () => {
    const expected = at + 2 * 24 * HOUR;
    const previous = baseline(90, expected, at);
    const result = evaluateWindow(previous, window(0, expected), {
      observedAt: at + 1800,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.equal(result.event?.kind, "unexpected");
  });

  it("adopts an advertised timestamp change without calling it a reset", () => {
    const previous = baseline(40);
    const changed = previous.expectedResetAt + 12 * HOUR;
    const result = evaluateWindow(previous, window(40, changed), {
      observedAt: at + 1800,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.equal(result.event, undefined);
    assert.equal(result.nextState.expectedResetAt, changed);
    assert.equal(result.scheduleChanged, true);
  });

  it("classifies a simultaneous early reset against the old expected timestamp", () => {
    const oldExpected = at + 3 * 24 * HOUR;
    const previous = baseline(80, oldExpected, at);
    const observedAt = at + 1800;
    const result = evaluateWindow(previous, window(0, observedAt + WEEK), {
      observedAt,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.equal(result.event?.kind, "unexpected");
    assert.equal(result.event?.expectedResetAt, oldExpected);
    assert.equal(result.nextState.expectedResetAt, observedAt + WEEK);
  });

  it("does not claim an unexpected reset after downtime spanning the expected reset", () => {
    const expected = at + 24 * HOUR;
    const previous = baseline(75, expected, at);
    const observedAt = at + 2 * 24 * HOUR;
    const result = evaluateWindow(previous, window(0, expected + WEEK), {
      observedAt,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.notEqual(result.event?.kind, "unexpected");
  });

  it("does not duplicate an unchanged observation or a persisted event", () => {
    const expected = at + 2 * 24 * HOUR;
    const previous = baseline(90, expected, at);
    const observedAt = at + 1800;
    const first = evaluateWindow(previous, window(0, observedAt + WEEK), {
      observedAt,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    const duplicate = evaluateWindow(first.nextState, window(0, observedAt + WEEK), {
      observedAt: observedAt + 60,
      gracePeriodMins: 60,
      pollingIntervalMins: 30
    });
    assert.ok(first.event);
    assert.equal(duplicate.event, undefined);
    assert.equal(duplicate.nextState.lastResetEvent?.id, first.event?.id);
  });
});
