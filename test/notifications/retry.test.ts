import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendWithRetry } from "../../src/notifications/retry.js";
import type { NotificationProvider } from "../../src/types.js";

describe("notification retry policy", () => {
  const subscription = {
    endpoint: "https://web.push.apple.com/example",
    keys: { p256dh: "long-enough-p256dh-value", auth: "long-auth-value" }
  };

  it("does not retry a permanent provider failure", async () => {
    let calls = 0;
    const provider: NotificationProvider = {
      id: "fake",
      async send() {
        calls += 1;
        return { status: "failed", error: "subscription expired" };
      },
      classifyFailure: () => "permanent"
    };
    const result = await sendWithRetry(provider, { id: "event", message: "test" }, [{ channel: "web-push", subscription }], {
      delaysMs: [1, 2],
      sleep: async () => undefined,
      random: () => 0
    });
    assert.equal(result.status, "failed");
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
    const result = await sendWithRetry(provider, { id: "event", message: "test" }, [{ channel: "web-push", subscription }], {
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
