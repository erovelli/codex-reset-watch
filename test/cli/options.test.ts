import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOptions, requireNoOptions } from "../../src/cli/options.js";

describe("CLI option parsing", () => {
  it("parses declared boolean and value options", () => {
    const options = parseOptions(["--force", "--url", "https://example.com/"], { "--force": "boolean", "--url": "value" });
    assert.equal(options.get("--force"), true);
    assert.equal(options.get("--url"), "https://example.com/");
  });

  it("rejects unknown, duplicate, missing, and unsupported options", () => {
    assert.throws(() => parseOptions(["--unknown"], {}), /Unknown option/);
    assert.throws(() => parseOptions(["--force", "--force"], { "--force": "boolean" }), /only once/);
    assert.throws(() => parseOptions(["--url"], { "--url": "value" }), /requires a value/);
    assert.throws(() => requireNoOptions(["--force"]), /does not accept options/);
  });
});
