import { chmod, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { ensurePrivateDirectory } from "../state/json-store.js";

export async function installStableRuntime(sourcePath: string, destinationPath: string): Promise<void> {
  await ensurePrivateDirectory(dirname(destinationPath));
  const bytes = await readFile(sourcePath);
  const temporary = `${destinationPath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o700);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, destinationPath);
    await chmod(destinationPath, 0o700);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
