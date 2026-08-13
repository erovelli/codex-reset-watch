import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runCheck } from "../../src/runtime/check.js";
import { Logger } from "../../src/utils/logger.js";
import type { MonitorConfig, MonitorState, NotificationProvider, UsageSnapshot, UsageSource } from "../../src/types.js";

const now = 1_800_000_000;
const week = 10_080 * 60;
const key = "codex:secondary";

function snapshot(usedPercent: number, resetsAt: number, observedAt: number): UsageSnapshot {
  return {
    observedAt,
    accountType: "chatgpt",
    windows: [{ key, limitId: "codex", windowKind: "secondary", usedPercent, windowDurationMins: 10_080, resetsAt }]
  };
}

describe("monitoring cycle", () => {
  it("tracks windows independently and never resends a persisted failed event", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crw-check-"));
    const snapshots = [
      snapshot(90, now + 3 * 86_400, now),
      snapshot(0, now + 1800 + week, now + 1800),
      snapshot(0, now + 1800 + week, now + 3600)
    ];
    const source: UsageSource = {
      async read() { return snapshots.shift()!; },
      async readAccount() { return { authenticated: true, accountType: "chatgpt" }; }
    };
    let sends = 0;
    const provider: NotificationProvider = {
      id: "fake",
      async send() { sends += 1; return { status: "failed", error: "subscription expired" }; },
      classifyFailure: () => "permanent"
    };
    const config: MonitorConfig = {
      schemaVersion: 2,
      pollingIntervalMins: 30,
      gracePeriodMins: 60,
      notifyUnexpected: true,
      notifyScheduled: false,
      provider: "web-push",
      monitoredWindowKeys: [key],
      codexPath: "/mock/codex",
      nodePath: process.execPath,
      installedVersion: "test",
      schedulerId: "test",
      webPush: {
        setupUrl: "https://example.com/",
        vapidSubject: "https://example.com",
        vapidPublicKey: "public",
        vapidPrivateKey: "private",
        subscription: {
          endpoint: "https://web.push.apple.com/example",
          keys: { p256dh: "long-enough-p256dh-value", auth: "long-auth-value" }
        }
      }
    };
    let state: MonitorState = { schemaVersion: 1, windows: {} };
    const base = {
      source,
      provider,
      recipients: [{ channel: "web-push" as const, subscription: config.webPush.subscription }],
      statePath: join(directory, "state.json"),
      lockPath: join(directory, "check.lock"),
      logger: new Logger(join(directory, "monitor.log")),
      retryOptions: { delaysMs: [1], sleep: async () => undefined }
    };
    state = await runCheck(config, { ...base, state });
    assert.equal(sends, 0);
    state = await runCheck(config, { ...base, state });
    assert.equal(state.windows[key]?.lastResetEvent?.kind, "unexpected");
    assert.equal(state.windows[key]?.lastResetEvent?.notificationStatus, "failed");
    state = await runCheck(config, { ...base, state });
    assert.equal(sends, 1);
  });
});
