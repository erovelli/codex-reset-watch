import type { Scheduler } from "../types.js";
import { findExecutable } from "../utils/process.js";
import { LinuxCronScheduler } from "./linux-cron.js";
import { LinuxSystemdScheduler } from "./linux-systemd.js";
import { MacOsScheduler } from "./macos.js";

export async function createScheduler(preferred?: string): Promise<Scheduler> {
  if (process.platform === "darwin") return new MacOsScheduler();
  if (process.platform !== "linux") throw new Error("Codex Reset Watch supports macOS and Linux");
  if (preferred === "cron") return new LinuxCronScheduler();
  if (preferred === "systemd-user") return new LinuxSystemdScheduler();
  if (await findExecutable("systemctl") && await LinuxSystemdScheduler.available()) return new LinuxSystemdScheduler();
  if (await findExecutable("crontab")) return new LinuxCronScheduler();
  throw new Error("No user-level systemd or crontab scheduler is available on this Linux system");
}
