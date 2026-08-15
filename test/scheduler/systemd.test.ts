import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { systemdQuote, systemdUserDirectory } from "../../src/scheduler/linux-systemd.js";

describe("systemd scheduler quoting", () => {
  it("escapes specifiers and rejects line injection", () => {
    assert.equal(systemdQuote('/home/user%name/"node"'), '"/home/user%%name/\\"node\\""');
    assert.throws(() => systemdQuote("/tmp/node\nExecStart=/bin/false"), /control characters/);
  });

  it("ignores a relative XDG config directory", () => {
    assert.equal(systemdUserDirectory({ XDG_CONFIG_HOME: "relative" }, "/home/test"), "/home/test/.config/systemd/user");
    assert.equal(systemdUserDirectory({ XDG_CONFIG_HOME: "/private/config" }, "/home/test"), "/private/config/systemd/user");
  });
});
