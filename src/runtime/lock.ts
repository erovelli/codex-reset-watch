import { open, readFile, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { ensurePrivateDirectory } from "../state/json-store.js";

export interface LockHandle {
  release(): Promise<void>;
}

async function ownerIsAlive(path: string): Promise<boolean | undefined> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? false : undefined;
  }
  const pid = Number(contents.trim());
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return undefined;
  }
}

export async function acquireLock(path: string, staleAfterMs = 30 * 60_000): Promise<LockHandle | undefined> {
  await ensurePrivateDirectory(dirname(path));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n`, "utf8");
      await handle.close();
      let released = false;
      return {
        async release() {
          if (released) return;
          released = true;
          await unlink(path).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const alive = await ownerIsAlive(path);
      if (alive === true) return undefined;
      const info = await stat(path).catch(() => undefined);
      if (alive === undefined && (!info || Date.now() - info.mtimeMs <= staleAfterMs)) return undefined;
      await unlink(path).catch(() => undefined);
    }
  }
  return undefined;
}
