import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import vm from "node:vm";

class FakeClassList {
  readonly values = new Set<string>();

  toggle(name: string, force: boolean): void {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
}

class FakeElement {
  hidden = false;
  disabled = false;
  textContent = "";
  value = "";
  readonly classList = new FakeClassList();
  readonly listeners = new Map<string, () => Promise<void> | void>();

  addEventListener(name: string, listener: () => Promise<void> | void): void {
    this.listeners.set(name, listener);
  }

  focus(): void {}
  select(): void {}
  scrollIntoView(): void {}
}

interface AppHarness {
  elements: Map<string, FakeElement>;
  stored: Map<string, string>;
  copied: string[];
  subscribedKeys: Uint8Array[];
}

async function appHarness(installed: boolean, includeKey: boolean, ios = true): Promise<AppHarness> {
  const source = await readFile(new URL("../../web/app.js", import.meta.url), "utf8");
  const selectors = ["#enable", "#status", "#key-panel", "#public-key", "#pairing", "#pairing-code", "#copy", "#copy-status", "#setup-state"];
  const elements = new Map(selectors.map((selector) => [selector, new FakeElement()]));
  elements.get("#key-panel")!.hidden = true;
  elements.get("#pairing")!.hidden = true;

  const keyBytes = new Uint8Array(65);
  keyBytes[0] = 4;
  const publicKey = Buffer.from(keyBytes).toString("base64url");
  const stored = new Map<string, string>();
  const copied: string[] = [];
  const subscribedKeys: Uint8Array[] = [];
  const subscription = {
    toJSON() {
      return {
        endpoint: "https://push.example.test/device",
        expirationTime: null,
        keys: { p256dh: "public-encryption-key", auth: "auth-secret" }
      };
    }
  };
  const registration = {
    pushManager: {
      async getSubscription() { return null; },
      async subscribe(options: { applicationServerKey: Uint8Array }) {
        subscribedKeys.push(options.applicationServerKey);
        return subscription;
      }
    }
  };
  const navigator = {
    standalone: installed,
    userAgent: ios ? "Mozilla/5.0 (iPhone)" : "Mozilla/5.0 (Macintosh)",
    platform: ios ? "iPhone" : "MacIntel",
    maxTouchPoints: ios ? 5 : 0,
    serviceWorker: {
      async register() { return registration; },
      ready: Promise.resolve(registration)
    },
    clipboard: {
      async writeText(value: string) { copied.push(value); }
    }
  };
  const window = {
    isSecureContext: true,
    navigator,
    Notification: {},
    PushManager: class {},
    matchMedia(query: string) {
      return { matches: query === "(display-mode: standalone)" ? installed : false };
    }
  };

  vm.runInNewContext(source, {
    window,
    navigator,
    Notification: { permission: "default" },
    document: { querySelector(selector: string) { return elements.get(selector); } },
    location: { hash: includeKey ? `#vapid=${publicKey}` : "", pathname: "/codex-reset-watch/", search: "" },
    history: { replaceState() {} },
    localStorage: {
      getItem(key: string) { return stored.get(key) ?? null; },
      setItem(key: string, value: string) { stored.set(key, value); }
    },
    URLSearchParams,
    TextEncoder,
    Uint8Array,
    atob,
    btoa
  });

  return { elements, stored, copied, subscribedKeys };
}

describe("Web Push setup app", () => {
  it("stores the CLI key in Safari and waits for the Home Screen app", async () => {
    const harness = await appHarness(false, true);
    assert.equal(harness.elements.get("#enable")!.disabled, true);
    assert.equal(harness.elements.get("#enable")!.textContent, "Open from Home Screen to continue");
    assert.equal(harness.elements.get("#setup-state")!.textContent, "Step 1 of 3");
    assert.equal(harness.elements.get("#key-panel")!.hidden, true);
    assert.ok(harness.stored.get("codex-reset-watch-vapid"));
  });

  it("creates and copies a pairing code from the installed app", async () => {
    const harness = await appHarness(true, true);
    assert.equal(harness.elements.get("#setup-state")!.textContent, "Step 3 of 3");

    await harness.elements.get("#enable")!.listeners.get("click")!();
    assert.equal(harness.subscribedKeys.length, 1);
    assert.equal(harness.elements.get("#pairing")!.hidden, false);
    assert.equal(harness.elements.get("#enable")!.hidden, true);
    assert.equal(harness.elements.get("#setup-state")!.textContent, "Ready");

    const code = harness.elements.get("#pairing-code")!.value;
    assert.ok(code.length > 0);
    await harness.elements.get("#copy")!.listeners.get("click")!();
    assert.deepEqual(harness.copied, [code]);
    assert.equal(harness.elements.get("#copy")!.textContent, "Copied");
  });

  it("asks for a public key when setup can run", async () => {
    const harness = await appHarness(true, false);
    assert.equal(harness.elements.get("#key-panel")!.hidden, false);

    await harness.elements.get("#enable")!.listeners.get("click")!();
    assert.equal(harness.subscribedKeys.length, 0);
    assert.equal(harness.elements.get("#setup-state")!.textContent, "Needs attention");
    assert.match(harness.elements.get("#status")!.textContent, /Paste the public key/);
  });

  it("allows the public key and subscription flow in a desktop browser", async () => {
    const harness = await appHarness(false, false, false);
    assert.equal(harness.elements.get("#enable")!.disabled, false);
    assert.equal(harness.elements.get("#key-panel")!.hidden, false);
    assert.equal(harness.elements.get("#setup-state")!.textContent, "Step 3 of 3");
    assert.match(harness.elements.get("#status")!.textContent, /Desktop test mode/);

    const keyBytes = new Uint8Array(65);
    keyBytes[0] = 4;
    harness.elements.get("#public-key")!.value = Buffer.from(keyBytes).toString("base64url");
    await harness.elements.get("#enable")!.listeners.get("click")!();

    assert.equal(harness.subscribedKeys.length, 1);
    assert.equal(harness.elements.get("#pairing")!.hidden, false);
  });
});
