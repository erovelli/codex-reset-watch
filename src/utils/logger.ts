import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";

export class Logger {
  constructor(private readonly path: string) {}

  async log(level: "info" | "warn" | "error", message: string): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const info = await stat(this.path).catch(() => undefined);
    if (info && info.size > 1_000_000) {
      await rename(this.path, `${this.path}.1`).catch(() => undefined);
    }
    await appendFile(this.path, `${new Date().toISOString()} ${level.toUpperCase()} ${message}\n`, {
      mode: 0o600
    });
  }
}
