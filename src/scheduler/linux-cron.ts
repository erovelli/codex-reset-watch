import type { Scheduler, SchedulerConfig, SchedulerStatus } from "../types.js";
import { runCommand } from "../utils/process.js";
import { shellQuote } from "./file-utils.js";

const startMarker = "# codex-reset-watch managed start";
const endMarker = "# codex-reset-watch managed end";

export function cronSchedules(minutes: number): string[] {
  const byMinute = new Map<number, number[]>();
  for (let offset = 0; offset < 1440; offset += minutes) {
    const minute = offset % 60;
    const hour = Math.floor(offset / 60);
    const hours = byMinute.get(minute) ?? [];
    hours.push(hour);
    byMinute.set(minute, hours);
  }
  const byHours = new Map<string, number[]>();
  for (const [minute, hours] of byMinute) {
    const hourExpression = hours.length === 24 ? "*" : hours.join(",");
    const minutes = byHours.get(hourExpression) ?? [];
    minutes.push(minute);
    byHours.set(hourExpression, minutes);
  }
  return [...byHours.entries()].map(([hours, minutesForHours]) =>
    `${minutesForHours.join(",")} ${hours} * * *`
  );
}

async function readCrontab(): Promise<string> {
  const result = await runCommand("crontab", ["-l"]);
  if (result.code !== 0 && !/no crontab/i.test(result.stderr)) throw new Error(`Could not read user crontab: ${result.stderr.trim()}`);
  return result.code === 0 ? result.stdout : "";
}

function withoutManaged(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let managed = false;
  for (const line of lines) {
    if (line === startMarker) { managed = true; continue; }
    if (line === endMarker) { managed = false; continue; }
    if (!managed) result.push(line);
  }
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

async function writeCrontab(content: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = requireSpawn();
    child.stdin.end(content.endsWith("\n") ? content : `${content}\n`);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Could not update user crontab: ${stderr.trim()}`)));
  });
}

function requireSpawn() {
  // Kept in a function to make this state-changing process easy to mock in downstream tests.
  return importSpawn("crontab", ["-"]);
}

import { spawn as importSpawn } from "node:child_process";

export class LinuxCronScheduler implements Scheduler {
  readonly id = "cron";

  async install(config: SchedulerConfig): Promise<void> {
    const existing = withoutManaged(await readCrontab());
    const command = `${shellQuote(config.nodePath)} ${shellQuote(config.runtimePath)} check >> ${shellQuote(config.logPath)} 2>&1`;
    const jobs = cronSchedules(config.pollingIntervalMins).map((entry) => `${entry} ${command}`).join("\n");
    const block = `${startMarker}\n${jobs}\n${endMarker}`;
    await writeCrontab(`${existing}${existing ? "\n\n" : ""}${block}\n`);
  }

  async uninstall(): Promise<void> {
    const existing = withoutManaged(await readCrontab());
    await writeCrontab(existing);
  }

  async start(): Promise<void> {
    const content = await readCrontab();
    if (!content.includes(startMarker)) throw new Error("Re-run `codex-reset-watch install` to restore the cron entry");
    await writeCrontab(content.replaceAll("# codex-reset-watch disabled ", ""));
  }

  async stop(): Promise<void> {
    const content = await readCrontab();
    const lines = content.split("\n");
    let managed = false;
    const stopped = lines.map((line) => {
      if (line === startMarker) { managed = true; return line; }
      if (line === endMarker) { managed = false; return line; }
      if (managed && line && !line.startsWith("# codex-reset-watch disabled ")) return `# codex-reset-watch disabled ${line}`;
      return line;
    }).join("\n");
    await writeCrontab(stopped);
  }

  async restart(): Promise<void> {
    await this.start();
  }

  async status(): Promise<SchedulerStatus> {
    const content = await readCrontab();
    const installed = content.includes(startMarker) && content.includes(endMarker);
    const running = installed && !content.includes("# codex-reset-watch disabled ");
    return { installed, running, adapter: this.id, ...(installed ? {} : { detail: "managed crontab entry not found" }) };
  }
}
