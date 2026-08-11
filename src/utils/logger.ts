import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";

function clean(value: string): string {
  return value.replace(/\+?\d[\d ()-]{7,}\d/g, (phone) => {
    const digits = phone.replace(/\D/g, "");
    return digits.length < 4 ? "***" : `***${digits.slice(-4)}`;
  });
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
  }
}
