import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadState, saveState, validateState } from "../../src/state/store.js";
import type { MonitorState } from "../../src/types.js";

const state: MonitorState = {
  schemaVersion: 1,
  windows: {
    "codex:primary": {
      expectedResetAt: 1_900_000_000,
      previousObservedResetAt: 1_900_000_000,
      lastObservedAt: 1_800_000_000,
      lastUsedPercent: 25,
      peakUsedPercent: 30
    }
  },
  lastSuccessfulCheck: 1_800_000_000,
  lastSnapshot: {
    observedAt: 1_800_000_000,
    accountType: "chatgpt",
    windows: [{
      key: "codex:primary",
      limitId: "codex",
      windowKind: "primary",
      usedPercent: 25,
      windowDurationMins: 10_080,
      resetsAt: 1_900_000_000
    }]
  }
};

describe("monitor state validation", () => {
  it("round-trips a complete state file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crw-state-"));
    const path = join(directory, "state.json");
    await saveState(path, state);
    assert.deepEqual(await loadState(path), state);
  });

  it("rejects corrupt nested state instead of trusting a schema marker", async () => {
    assert.throws(() => validateState({ ...state, windows: { "codex:primary": { expectedResetAt: "soon" } } }), /expectedResetAt/);
    const directory = await mkdtemp(join(tmpdir(), "crw-state-invalid-"));
    const path = join(directory, "state.json");
    await writeFile(path, JSON.stringify({ schemaVersion: 1, windows: [], lastCheckError: "bad" }));
    await assert.rejects(() => loadState(path), /windows must be an object/);
  });
});
