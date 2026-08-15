import assert from "node:assert/strict";
import { mkdtemp, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { acquireLock } from "../../src/runtime/lock.js";

describe("monitor lock", () => {
  it("never steals a live process lock just because its timestamp is old", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crw-lock-"));
    const path = join(directory, "check.lock");
    const first = await acquireLock(path, 0);
    assert.ok(first);
    assert.equal(await acquireLock(path, 0), undefined);
    await first.release();
    const next = await acquireLock(path, 0);
    assert.ok(next);
    await next.release();
  });

  it("does not delete a replacement lock when an old handle releases", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crw-lock-replaced-"));
    const path = join(directory, "check.lock");
    const first = await acquireLock(path);
    assert.ok(first);
    await unlink(path);
    const replacement = await acquireLock(path);
    assert.ok(replacement);
    await first.release();
    assert.equal(await acquireLock(path), undefined);
    await replacement.release();
  });
});
