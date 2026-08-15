import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export async function atomicWriteText(path: string, content: string, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", mode);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
    await chmod(path, mode);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function assertSafeSchedulerValue(value: string, label: string): void {
  if (value.length === 0 || /[\0\r\n]/.test(value)) {
    throw new Error(`${label} contains unsupported control characters`);
  }
}

export function cronShellQuote(value: string, label: string): string {
  assertSafeSchedulerValue(value, label);
  return shellQuote(value).replaceAll("%", "\\%");
}
