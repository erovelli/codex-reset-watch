import { appendFile, chmod, mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";

function clean(message: string): string {
  const singleLine = message.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
  return singleLine.length <= 4000 ? singleLine : `${singleLine.slice(0, 3997)}...`;
}

export class Logger {
  constructor(private readonly path: string) {}

  async log(level: "info" | "warn" | "error", message: string): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const info = await stat(this.path).catch(() => undefined);
    if (info && info.size > 1_000_000) {
      await rename(this.path, `${this.path}.1`).catch(() => undefined);
    }
    await appendFile(this.path, `${new Date().toISOString()} ${level.toUpperCase()} ${clean(message)}\n`, {
      mode: 0o600
    });
    await chmod(this.path, 0o600);
  }
}
