import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { constants } from "node:fs";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function runCommand(command: string, args: string[], inherit = false): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    if (!inherit) {
      child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    }
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function findExecutable(nameOrPath: string): Promise<string | undefined> {
  const candidates = isAbsolute(nameOrPath)
    ? [nameOrPath]
    : (process.env.PATH ?? "").split(delimiter).filter(Boolean).map((part) => join(part, nameOrPath));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }
  return undefined;
}
