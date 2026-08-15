import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Logger } from "../../src/utils/logger.js";

describe("private logger", () => {
  it("keeps external errors on one private bounded line", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crw-log-"));
    const path = join(directory, "monitor.log");
    await new Logger(path).log("error", `first\nsecond${"x".repeat(5000)}`);
    const contents = await readFile(path, "utf8");
    assert.equal(contents.trimEnd().split("\n").length, 1);
    assert.ok(contents.length < 4200);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  });
});
