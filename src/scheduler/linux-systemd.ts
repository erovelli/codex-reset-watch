import { homedir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import type { Scheduler, SchedulerConfig, SchedulerStatus } from "../types.js";
import { runCommand } from "../utils/process.js";
import { atomicWriteText } from "./file-utils.js";

const serviceName = "codex-reset-watch.service";
const timerName = "codex-reset-watch.timer";

function systemdQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export class LinuxSystemdScheduler implements Scheduler {
  readonly id = "systemd-user";
  private readonly directory = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "systemd", "user");
  private readonly servicePath = join(this.directory, serviceName);
  private readonly timerPath = join(this.directory, timerName);

  static async available(): Promise<boolean> {
    const result = await runCommand("systemctl", ["--user", "show-environment"]).catch(() => undefined);
    return result?.code === 0;
  }

  async install(config: SchedulerConfig): Promise<void> {
    const service = `[Unit]\nDescription=Check Codex rate-limit resets\n\n[Service]\nType=oneshot\nExecStart=${systemdQuote(config.nodePath)} ${systemdQuote(config.runtimePath)} check\n`;
    const timer = `[Unit]\nDescription=Periodically check Codex rate-limit resets\n\n[Timer]\nOnBootSec=1min\nOnUnitActiveSec=${config.pollingIntervalMins}min\nPersistent=true\nAccuracySec=1min\n\n[Install]\nWantedBy=timers.target\n`;
    await atomicWriteText(this.servicePath, service);
    await atomicWriteText(this.timerPath, timer);
    const reload = await runCommand("systemctl", ["--user", "daemon-reload"]);
    if (reload.code !== 0) throw new Error(`systemd user reload failed: ${reload.stderr.trim()}`);
    const enable = await runCommand("systemctl", ["--user", "enable", "--now", timerName]);
    if (enable.code !== 0) throw new Error(`systemd user timer install failed: ${enable.stderr.trim()}`);
  }

  async uninstall(): Promise<void> {
    await runCommand("systemctl", ["--user", "disable", "--now", timerName]).catch(() => undefined);
    await unlink(this.servicePath).catch(() => undefined);
    await unlink(this.timerPath).catch(() => undefined);
    await runCommand("systemctl", ["--user", "daemon-reload"]).catch(() => undefined);
  }

  async start(): Promise<void> {
    const result = await runCommand("systemctl", ["--user", "start", timerName]);
    if (result.code !== 0) throw new Error(`Could not start systemd timer: ${result.stderr.trim()}`);
  }

  async stop(): Promise<void> {
    const result = await runCommand("systemctl", ["--user", "stop", timerName]);
    if (result.code !== 0 && !/not loaded|not found/i.test(result.stderr)) throw new Error(`Could not stop systemd timer: ${result.stderr.trim()}`);
  }

  async restart(): Promise<void> {
    const result = await runCommand("systemctl", ["--user", "restart", timerName]);
    if (result.code !== 0) throw new Error(`Could not restart systemd timer: ${result.stderr.trim()}`);
  }

  async status(): Promise<SchedulerStatus> {
    const result = await runCommand("systemctl", ["--user", "is-active", timerName]);
    const installed = !/not-found|could not be found/i.test(`${result.stdout}${result.stderr}`);
    return { installed, running: result.stdout.trim() === "active", adapter: this.id, detail: result.stdout.trim() || result.stderr.trim() };
  }
}
