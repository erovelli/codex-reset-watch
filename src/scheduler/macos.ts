import { homedir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import type { Scheduler, SchedulerConfig, SchedulerStatus } from "../types.js";
import { runCommand } from "../utils/process.js";
import { atomicWriteText } from "./file-utils.js";

const label = "com.codex-reset-watch.monitor";

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export class MacOsScheduler implements Scheduler {
  readonly id = "launchd";
  private readonly plistPath = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
  private readonly domain = `gui/${process.getuid?.() ?? 0}`;

  async install(config: SchedulerConfig): Promise<void> {
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(config.nodePath)}</string><string>${xml(config.runtimePath)}</string><string>check</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>${Math.round(config.pollingIntervalMins * 60)}</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(config.logPath)}</string>
  <key>StandardErrorPath</key><string>${xml(config.logPath)}</string>
</dict>
</plist>
`;
    await this.stop();
    await atomicWriteText(this.plistPath, content);
    const result = await runCommand("launchctl", ["bootstrap", this.domain, this.plistPath]);
    if (result.code !== 0) throw new Error(`Could not enable LaunchAgent: ${result.stderr.trim()}`);
  }

  async uninstall(): Promise<void> {
    await this.stop();
    await unlink(this.plistPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  async start(): Promise<void> {
    const result = await runCommand("launchctl", ["bootstrap", this.domain, this.plistPath]);
    if (result.code !== 0 && !/already loaded|service already loaded/i.test(result.stderr)) {
      throw new Error(`Could not start LaunchAgent: ${result.stderr.trim()}`);
    }
  }

  async stop(): Promise<void> {
    await runCommand("launchctl", ["bootout", this.domain, this.plistPath]).catch(() => undefined);
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async status(): Promise<SchedulerStatus> {
    const result = await runCommand("launchctl", ["print", `${this.domain}/${label}`]);
    return { installed: result.code === 0, running: result.code === 0, adapter: this.id, ...(result.code === 0 ? {} : { detail: result.stderr.trim() || "not loaded" }) };
  }
}
