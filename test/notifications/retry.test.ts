import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendWithRetry } from "../../src/notifications/retry.js";
import type { NotificationProvider } from "../../src/types.js";

describe("notification retry policy", () => {
  it("does not retry quota exhaustion", async () => {
    let calls = 0;
    const provider: NotificationProvider = {
      id: "fake",
      async send() {
        calls += 1;
        return { status: "quota-exhausted", error: "daily quota exhausted" };
      },
      classifyFailure: () => "permanent"
    };
    const result = await sendWithRetry(provider, { id: "event", message: "test" }, [{ phone: "+15551234567" }], {
      delaysMs: [1, 2],
      sleep: async () => undefined,
      random: () => 0
    });
    assert.equal(result.status, "quota-exhausted");
    assert.equal(calls, 1);
  });

  it("retries temporary failures with a finite exponential schedule", async () => {
    let calls = 0;
    const slept: number[] = [];
    const attempts: string[] = [];
    const provider: NotificationProvider = {
      id: "fake",
      async send() {
        calls += 1;
        if (calls < 3) throw new Error("temporary network failure");
        return { status: "sent", providerMessageId: "ok" };
      },
      classifyFailure: () => "transient"
    };
    const result = await sendWithRetry(provider, { id: "event", message: "test" }, [{ phone: "+15551234567" }], {
      delaysMs: [30, 60, 120],
      sleep: async (ms) => { slept.push(ms); },
      random: () => 0,
      onAttempt: (attempt, total) => { attempts.push(`attempt:${attempt}/${total}`); },
      onRetry: ({ attempt, delayMs }) => { attempts.push(`retry:${attempt}:${delayMs}`); }
    });
    assert.equal(result.status, "sent");
    assert.equal(calls, 3);
    assert.deepEqual(slept, [24, 48]);
    assert.deepEqual(attempts, [
      "attempt:1/4",
      "retry:1:24",
      "attempt:2/4",
      "retry:2:48",
      "attempt:3/4"
    ]);
  });
});
