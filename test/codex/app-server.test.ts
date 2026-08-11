import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CodexAppServerSource } from "../../src/codex/app-server.js";

describe("Codex App Server source", () => {
  it("performs the handshake and reads account plus multi-bucket limits without a model turn", async () => {
    const fixture = fileURLToPath(new URL("../fixtures/mock-codex.mjs", import.meta.url));
    const source = new CodexAppServerSource(process.execPath, [fixture]);
    const snapshot = await source.read();
    assert.equal(snapshot.accountType, "chatgpt");
    assert.deepEqual(snapshot.windows.map((window) => window.key), ["codex:primary", "codex:secondary"]);
  });
});
