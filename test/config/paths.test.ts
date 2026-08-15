import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAppPaths } from "../../src/config/paths.js";

describe("application paths", () => {
  it("ignores relative XDG locations as required by the XDG specification", () => {
    const paths = getAppPaths("linux", {
      XDG_CONFIG_HOME: "relative-config",
      XDG_STATE_HOME: "relative-state",
      XDG_DATA_HOME: "/data"
    }, "/home/tester");
    assert.equal(paths.configDir, "/home/tester/.config/codex-reset-watch");
    assert.equal(paths.stateDir, "/home/tester/.local/state/codex-reset-watch");
    assert.equal(paths.dataDir, "/data/codex-reset-watch");
  });
});
