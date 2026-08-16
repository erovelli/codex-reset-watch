import { chmod, open, mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

export async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > 10_000_000) {
      throw new Error(`JSON file ${path} is not a regular file smaller than 10 MB`);
    }
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${path}: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const directory = dirname(path);
  await ensurePrivateDirectory(directory);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
    await chmod(path, 0o600);
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
