import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import vm from "node:vm";

class ThemeButton {
  hidden = true;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly label = { textContent: "" };

  querySelector(selector: string) {
    return selector === "[data-theme-label]" ? this.label : null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }
}

async function themeHarness(storedTheme: string | null, systemDark: boolean) {
  const source = await readFile(new URL("../../web/theme.js", import.meta.url), "utf8");
  const root = { dataset: {} as Record<string, string> };
  const metaAttributes = new Map([
    ["content", "#f3f0e6"],
    ["data-light", "#f3f0e6"],
    ["data-dark", "#0c1115"]
  ]);
  const meta = {
    getAttribute(name: string) { return metaAttributes.get(name) ?? null; },
    setAttribute(name: string, value: string) { metaAttributes.set(name, value); }
  };
  const favicon = {
    dataset: { light: "icon-smiley.svg", dark: "icon-smiley-dark.svg" },
    href: "icon-smiley.svg",
    setAttribute(name: string, value: string) {
      if (name === "href") this.href = value;
    }
  };
  const control = new ThemeButton();
  const stored = new Map<string, string>();
  if (storedTheme) stored.set("theme", storedTheme);
  const mediaListeners: Array<() => void> = [];
  const media = {
    matches: systemDark,
    addEventListener(name: string, listener: () => void) {
      if (name === "change") mediaListeners.push(listener);
    }
  };

  vm.runInNewContext(source, {
    window: { matchMedia() { return media; } },
    document: {
      documentElement: root,
      readyState: "complete",
      querySelector(selector: string) {
        if (selector === 'meta[name="theme-color"]') return meta;
        if (selector === "[data-theme-control]") return control;
        return null;
      },
      querySelectorAll(selector: string) {
        return selector === "[data-theme-favicon]" ? [favicon] : [];
      }
    },
    localStorage: {
      getItem(key: string) { return stored.get(key) ?? null; },
      setItem(key: string, value: string) { stored.set(key, value); }
    },
    HTMLButtonElement: ThemeButton
  });

  return { root, metaAttributes, favicon, control, stored, media, mediaListeners };
}

describe("pairing page theme control", () => {
  it("shares and updates the portfolio theme preference", async () => {
    const harness = await themeHarness("dark", false);
    assert.deepEqual(harness.root.dataset, { theme: "dark", themeSource: "user" });
    assert.equal(harness.metaAttributes.get("content"), "#0c1115");
    assert.equal(harness.favicon.href, "icon-smiley-dark.svg");
    assert.equal(harness.control.hidden, false);
    assert.equal(harness.control.label.textContent, "Dark");
    assert.equal(harness.control.attributes.get("aria-label"), "Switch to light theme");

    harness.control.listeners.get("click")!();
    assert.equal(harness.root.dataset.theme, "light");
    assert.equal(harness.stored.get("theme"), "light");
    assert.equal(harness.metaAttributes.get("content"), "#f3f0e6");
    assert.equal(harness.favicon.href, "icon-smiley.svg");
    assert.equal(harness.control.label.textContent, "Light");
  });

  it("follows system changes until the user makes a choice", async () => {
    const harness = await themeHarness(null, false);
    assert.deepEqual(harness.root.dataset, { theme: "light", themeSource: "system" });

    harness.media.matches = true;
    harness.mediaListeners[0]!();
    assert.equal(harness.root.dataset.theme, "dark");
    assert.equal(harness.metaAttributes.get("content"), "#0c1115");
    assert.equal(harness.favicon.href, "icon-smiley-dark.svg");
    assert.equal(harness.control.label.textContent, "Dark");
  });
});
