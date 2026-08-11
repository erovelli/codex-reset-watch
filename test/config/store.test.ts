import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateConfig } from "../../src/config/store.js";

const base = {
  schemaVersion: 1,
  phone: "+15551234567",
  pollingIntervalMins: 30,
  gracePeriodMins: 60,
  notifyUnexpected: true,
  notifyScheduled: false,
  monitoredWindowKeys: ["codex:primary"],
  codexPath: "/usr/local/bin/codex",
  nodePath: process.execPath,
  installedVersion: "test",
  acceptedSmsTermsAt: 1_800_000_000,
  schedulerId: "test"
};

describe("configuration validation", () => {
  it("accepts an existing Textbelt configuration", () => {
    assert.equal(validateConfig({ ...base, provider: "textbelt-free" }).provider, "textbelt-free");
  });

  it("accepts a complete HTTPS Web Push configuration", () => {
    const config = validateConfig({
      ...base,
      provider: "web-push",
      webPush: {
        setupUrl: "https://example.com/reset-watch/",
        vapidSubject: "https://example.com",
        vapidPublicKey: "public-key",
        vapidPrivateKey: "private-key",
        subscription: {
          endpoint: "https://web.push.apple.com/example",
          expirationTime: null,
          keys: {
            p256dh: "BNcRdreALRFXTkOOUHK1EtK8gN6Lyt6Sl9A-example",
            auth: "tBHItJI5svbpez7KI4CCXg"
          }
        }
      }
    });
    assert.equal(config.provider, "web-push");
    assert.equal(config.webPush?.subscription.endpoint, "https://web.push.apple.com/example");
  });

  it("rejects incomplete or insecure Web Push configuration", () => {
    assert.throws(() => validateConfig({ ...base, provider: "web-push" }), /configuration is missing/);
    assert.throws(() => validateConfig({
      ...base,
      provider: "web-push",
      webPush: {
        setupUrl: "http://example.com/",
        vapidSubject: "https://example.com",
        vapidPublicKey: "public",
        vapidPrivateKey: "private",
        subscription: {
          endpoint: "https://web.push.apple.com/example",
          keys: { p256dh: "long-enough-p256dh-value", auth: "long-auth-value" }
        }
      }
    }), /must use HTTPS/);
  });
});
