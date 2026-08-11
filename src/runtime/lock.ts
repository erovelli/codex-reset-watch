import { open, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { ensurePrivateDirectory } from "../state/json-store.js";

export interface LockHandle {
  release(): Promise<void>;
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
      const info = await stat(path).catch(() => undefined);
      if (!info || Date.now() - info.mtimeMs <= staleAfterMs) return undefined;
      await unlink(path).catch(() => undefined);
    }
  }
  return undefined;
}
