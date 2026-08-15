import type { Scheduler, SchedulerConfig, SchedulerStatus } from "../types.js";
import { runCommand } from "../utils/process.js";
import { cronShellQuote } from "./file-utils.js";

const startMarker = "# codex-reset-watch managed start";
const endMarker = "# codex-reset-watch managed end";

export function cronSchedules(minutes: number): string[] {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new Error("Cron polling interval must be an integer from 1 to 1440 minutes");
  }
  if (1440 % minutes !== 0) {
    throw new Error(`A ${minutes}-minute interval needs an epoch guard to remain exact across midnight`);
  }
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

function greatestCommonDivisor(left: number, right: number): number {
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

export function cronEntries(minutes: number, command: string): string[] {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new Error("Cron polling interval must be an integer from 1 to 1440 minutes");
  }
  if (1440 % minutes === 0) return cronSchedules(minutes).map((schedule) => `${schedule} ${command}`);
  const cadence = greatestCommonDivisor(minutes, 60);
  const minuteField = cadence === 1 ? "*" : `*/${cadence}`;
  const guard = `test $(( $(date +\\%s) / 60 \\% ${minutes} )) -eq 0`;
  return [`${minuteField} * * * * ${guard} && ${command}`];
}

async function readCrontab(): Promise<string> {
  const result = await runCommand("crontab", ["-l"]);
  if (result.code !== 0 && !/no crontab/i.test(result.stderr)) throw new Error(`Could not read user crontab: ${result.stderr.trim()}`);
  return result.code === 0 ? result.stdout : "";
}

function markerBounds(lines: string[]): { start: number; end: number } | undefined {
  const starts = lines.flatMap((line, index) => line === startMarker ? [index] : []);
  const ends = lines.flatMap((line, index) => line === endMarker ? [index] : []);
  if (starts.length === 0 && ends.length === 0) return undefined;
  if (starts.length !== 1 || ends.length !== 1 || starts[0] === undefined || ends[0] === undefined || starts[0] >= ends[0]) {
    throw new Error("The managed Codex Reset Watch crontab markers are malformed; repair them manually before continuing");
  }
  return { start: starts[0], end: ends[0] };
}

export function withoutManaged(content: string): string {
  const lines = content.split("\n");
  const bounds = markerBounds(lines);
  const result = bounds ? [...lines.slice(0, bounds.start), ...lines.slice(bounds.end + 1)] : lines;
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

async function writeCrontab(content: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = requireSpawn();
    child.stdin.end(content.endsWith("\n") ? content : `${content}\n`);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.stdin.on("error", reject);
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
    const command = `${cronShellQuote(config.nodePath, "Node path")} ${cronShellQuote(config.runtimePath, "runtime path")} check >> ${cronShellQuote(config.logPath, "log path")} 2>&1`;
    const jobs = cronEntries(config.pollingIntervalMins, command).join("\n");
    const block = `${startMarker}\n${jobs}\n${endMarker}`;
    await writeCrontab(`${existing}${existing ? "\n\n" : ""}${block}\n`);
  }

  async uninstall(): Promise<void> {
    const existing = withoutManaged(await readCrontab());
    await writeCrontab(existing);
  }

  async start(): Promise<void> {
    const content = await readCrontab();
    const lines = content.split("\n");
    const bounds = markerBounds(lines);
    if (!bounds) throw new Error("Re-run `codex-reset-watch install` to restore the cron entry");
    const started = lines.map((line, index) => index > bounds.start && index < bounds.end
      ? line.replace(/^# codex-reset-watch disabled /, "")
      : line).join("\n");
    await writeCrontab(started);
  }

  async stop(): Promise<void> {
    const content = await readCrontab();
    const lines = content.split("\n");
    const bounds = markerBounds(lines);
    if (!bounds) throw new Error("Re-run `codex-reset-watch install` to restore the cron entry");
    const stopped = lines.map((line, index) => {
      if (index > bounds.start && index < bounds.end && line && !line.startsWith("# codex-reset-watch disabled ")) return `# codex-reset-watch disabled ${line}`;
      return line;
    }).join("\n");
    await writeCrontab(stopped);
  }

  async restart(): Promise<void> {
    await this.start();
  }

  async status(): Promise<SchedulerStatus> {
    const content = await readCrontab();
    try {
      const lines = content.split("\n");
      const bounds = markerBounds(lines);
      const installed = bounds !== undefined;
      const running = installed && lines.slice(bounds.start + 1, bounds.end).some((line) => line.length > 0 && !line.startsWith("# codex-reset-watch disabled "));
      return { installed, running, adapter: this.id, ...(installed ? {} : { detail: "managed crontab entry not found" }) };
    } catch (error) {
      return { installed: false, running: false, adapter: this.id, detail: (error as Error).message };
    }
  }
}
