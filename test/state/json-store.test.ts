import assert from "node:assert/strict";
import { chmod, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { atomicWriteJson, ensurePrivateDirectory, readJsonFile } from "../../src/state/json-store.js";

describe("private JSON persistence", () => {
  it("repairs directory permissions and writes private files", async () => {
    const root = await mkdtemp(join(tmpdir(), "crw-json-"));
    const directory = join(root, "config");
    await ensurePrivateDirectory(directory);
    await chmod(directory, 0o755);
    await ensurePrivateDirectory(directory);
    const path = join(directory, "config.json");
    await atomicWriteJson(path, { ok: true });
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(await readJsonFile(path), { ok: true });
  });
});
