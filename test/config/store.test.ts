import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadConfig, loadConfigForWebPushSetup, saveConfig, validateConfig } from "../../src/config/store.js";

const webPush = {
  setupUrl: "https://example.com/reset-watch/",
  vapidSubject: "https://example.com",
  vapidPublicKey: "B".repeat(87),
  vapidPrivateKey: "p".repeat(43),
  subscription: {
    endpoint: "https://web.push.apple.com/example",
    expirationTime: null,
    keys: {
      p256dh: "BNcRdreALRFXTkOOUHK1EtK8gN6Lyt6Sl9A-example",
      auth: "tBHItJI5svbpez7KI4CCXg"
    }
  }
};

const base = {
  schemaVersion: 2,
  provider: "web-push",
  pollingIntervalMins: 30,
  gracePeriodMins: 60,
  notifyUnexpected: true,
  notifyScheduled: false,
  monitoredWindowKeys: ["codex:primary"],
  codexPath: "/usr/local/bin/codex",
  nodePath: process.execPath,
  installedVersion: "test",
  schedulerId: "test",
  webPush
};

describe("configuration validation", () => {
  it("accepts a complete HTTPS Web Push configuration", () => {
    const config = validateConfig(base);
    assert.equal(config.provider, "web-push");
    assert.equal(config.webPush.subscription.endpoint, "https://web.push.apple.com/example");
  });

  it("rejects removed providers, unsafe URLs, and out-of-range settings", () => {
    assert.throws(() => validateConfig({ ...base, provider: "textbelt-free" }), /Unsupported notification provider/);
    assert.throws(() => validateConfig({ ...base, pollingIntervalMins: 0 }), /integer from 5 to 1440/);
    assert.throws(() => validateConfig({ ...base, monitoredWindowKeys: [] }), /at least one/);
    assert.throws(() => validateConfig({
      ...base,
      webPush: { ...webPush, setupUrl: "http://example.com/" }
    }), /must use HTTPS/);
    assert.throws(() => validateConfig({
      ...base,
      webPush: { ...webPush, vapidPrivateKey: "invalid" }
    }), /private key is invalid/);
  });

  it("loads paired v1 configurations and drops legacy SMS data when saved", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crw-config-"));
    const path = join(directory, "config.json");
    await writeFile(path, JSON.stringify({
      ...base,
      schemaVersion: 1,
      phone: "+15551234567",
      acceptedSmsTermsAt: 1_800_000_000
    }));
    const migrated = await loadConfig(path);
    assert.equal(migrated?.schemaVersion, 2);
    await saveConfig(path, migrated!);
    const stored = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    assert.equal(stored.phone, undefined);
    assert.equal(stored.acceptedSmsTermsAt, undefined);
  });

  it("retains monitoring settings while preparing a legacy SMS install for Web Push", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crw-legacy-config-"));
    const path = join(directory, "config.json");
    await writeFile(path, JSON.stringify({
      ...base,
      schemaVersion: 1,
      provider: "textbelt-free",
      phone: "+15551234567",
      acceptedSmsTermsAt: 1_800_000_000,
      webPush: undefined
    }));
    await assert.rejects(() => loadConfig(path), /setup-web-push/);
    const setup = await loadConfigForWebPushSetup(path);
    assert.deepEqual(setup?.monitoredWindowKeys, ["codex:primary"]);
    assert.equal(setup?.webPush, undefined);
  });
});
