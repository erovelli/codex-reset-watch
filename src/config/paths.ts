import { homedir } from "node:os";
import { join } from "node:path";

export interface AppPaths {
  configDir: string;
  stateDir: string;
  dataDir: string;
  logDir: string;
  configFile: string;
  stateFile: string;
  runtimeFile: string;
  lockFile: string;
  logFile: string;
}

export function getAppPaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  userHome = homedir()
): AppPaths {
  let configDir: string;
  let stateDir: string;
  let dataDir: string;
  let logDir: string;
  if (platform === "darwin") {
    const root = join(userHome, "Library", "Application Support", "codex-reset-watch");
    configDir = join(root, "config");
    stateDir = join(root, "state");
    dataDir = join(root, "runtime");
    logDir = join(userHome, "Library", "Logs", "codex-reset-watch");
  } else {
    configDir = join(env.XDG_CONFIG_HOME ?? join(userHome, ".config"), "codex-reset-watch");
    stateDir = join(env.XDG_STATE_HOME ?? join(userHome, ".local", "state"), "codex-reset-watch");
    dataDir = join(env.XDG_DATA_HOME ?? join(userHome, ".local", "share"), "codex-reset-watch");
    logDir = join(stateDir, "logs");
  }
  return {
    configDir,
    stateDir,
    dataDir,
    logDir,
    configFile: join(configDir, "config.json"),
    stateFile: join(stateDir, "state.json"),
    runtimeFile: join(dataDir, "codex-reset-watch.js"),
    lockFile: join(stateDir, "check.lock"),
    logFile: join(logDir, "monitor.log")
  };
}
