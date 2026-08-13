import { fileURLToPath } from "node:url";
import { rmdir, unlink } from "node:fs/promises";
import { CodexAppServerSource } from "../codex/app-server.js";
import { getAppPaths } from "../config/paths.js";
import { loadConfig, loadConfigForWebPushSetup, saveConfig } from "../config/store.js";
import { isWeeklyWindow } from "../detection/detector.js";
import { configuredRecipients, createConfiguredProvider, providerDisplayName } from "../notifications/configured.js";
import { generateVapidKeys } from "../notifications/providers/web-push.js";
import { sendWithRetry } from "../notifications/retry.js";
import { decodeSubscriptionCode } from "../notifications/web-push-pairing.js";
import { runCheck } from "../runtime/check.js";
import { installStableRuntime } from "../runtime/install.js";
import { createScheduler } from "../scheduler/index.js";
import { loadState, saveState } from "../state/store.js";
import { ensurePrivateDirectory } from "../state/json-store.js";
import type { MonitorConfig, SchedulerConfig, UsageSnapshot, WebPushConfig } from "../types.js";
import { Logger } from "../utils/logger.js";
import { findExecutable, runCommand } from "../utils/process.js";
import { APP_VERSION } from "../version.js";
import { describeWindow, localTime } from "./format.js";
import { Prompt } from "./prompt.js";
import { baselineState, configureChoices, installChoices, settingsFromSnapshot } from "./wizard.js";

const DEFAULT_WEB_PUSH_SETUP_URL = "https://erovelli.github.io/codex-reset-watch/";
const paths = getAppPaths();

function help(): void {
  console.log(`codex-reset-watch ${APP_VERSION}

Usage: codex-reset-watch <command>

Commands:
  install [--dry-run]  Configure and install the native background scheduler
  configure            Edit monitoring settings interactively
  status               Show scheduler, account, windows, and notification state
  check                Run one foreground monitoring cycle
  setup-web-push       Pair an iPhone Home Screen app and switch to Web Push
  test-push [--force]  Send an explicit Web Push test notification
  start | stop | restart
  uninstall            Remove scheduler/runtime, optionally retaining config/state
`);
}

async function requireConfig(): Promise<MonitorConfig> {
  const config = await loadConfig(paths.configFile);
  if (!config) throw new Error("Codex Reset Watch is not installed. Run `npx codex-reset-watch install`.");
  return config;
}

async function codexSource(prompt?: Prompt): Promise<{ path: string; source: CodexAppServerSource }> {
  const requested = process.env.CODEX_RESET_WATCH_CODEX_PATH ?? "codex";
  const codexPath = await findExecutable(requested);
  if (!codexPath) {
    throw new Error("Codex CLI is required but was not found. Install it with `npm install -g @openai/codex`, then run `codex login` and retry.");
  }
  const source = new CodexAppServerSource(codexPath);
  let account = await source.readAccount();
  if (!account.authenticated && prompt) {
    console.log(account.reason ?? "Codex is not authenticated with ChatGPT.");
    if (await prompt.confirm("Run the normal interactive `codex login` flow now", true)) {
      const result = await runCommand(codexPath, ["login"], true);
      if (result.code !== 0) throw new Error("Codex login did not complete successfully");
      account = await source.readAccount();
    }
  }
  if (!account.authenticated) throw new Error(`${account.reason ?? "Codex is not authenticated."} Run \`codex login\` and retry.`);
  return { path: codexPath, source };
}

function schedulerConfig(config: MonitorConfig): SchedulerConfig {
  return {
    pollingIntervalMins: config.pollingIntervalMins,
    nodePath: config.nodePath,
    runtimePath: paths.runtimeFile,
    logPath: paths.logFile
  };
}

async function printSuccess(config: MonitorConfig, snapshot: UsageSnapshot, dryRun: boolean): Promise<void> {
  const weekly = snapshot.windows.filter((window) => config.monitoredWindowKeys.includes(window.key) && isWeeklyWindow(window));
  console.log(`\n${dryRun ? "Dry run complete; no files or scheduler were changed." : "Codex Reset Watch installed successfully. Monitoring is live."}`);
  console.log(`Monitored windows: ${config.monitoredWindowKeys.join(", ")}`);
  console.log(`Polling interval: ${config.pollingIntervalMins} minutes`);
  console.log(`Scheduled reset notifications: ${config.notifyScheduled ? "on" : "off"}`);
  console.log(`Unexpected reset notifications: ${config.notifyUnexpected ? "on" : "off"}`);
  console.log(`Next advertised weekly reset: ${localTime(weekly.sort((a, b) => a.resetsAt - b.resetsAt)[0]?.resetsAt)}`);
  console.log("Useful commands: codex-reset-watch status | configure | check | test-push");
}

async function installCommand(args: string[]): Promise<void> {
  const prompt = new Prompt();
  const dryRun = args.includes("--dry-run");
  try {
    const existing = await loadConfig(paths.configFile);
    if (existing && !dryRun) {
      console.log(`Codex Reset Watch ${existing.installedVersion} is already installed.`);
      if (await prompt.confirm("Update the installed runtime and keep current configuration", true)) {
        const scheduler = await createScheduler(existing.schedulerId);
        const updated = { ...existing, nodePath: process.execPath, installedVersion: APP_VERSION, schedulerId: scheduler.id };
        await installStableRuntime(fileURLToPath(import.meta.url), paths.runtimeFile);
        await saveConfig(paths.configFile, updated);
        await ensurePrivateDirectory(paths.logDir);
        await scheduler.install(schedulerConfig(updated));
        console.log(`Updated the stable runtime to ${APP_VERSION}; configuration and state were retained.`);
        return;
      }
    }
    const { customize } = await installChoices(prompt);
    console.log("\nVerifying Codex CLI and ChatGPT authentication...");
    const codex = await codexSource(prompt);
    const snapshot = await codex.source.read();
    const settings = await settingsFromSnapshot(prompt, snapshot, customize);
    const scheduler = await createScheduler();
    if (dryRun) {
      console.log("\nDry run complete; Codex access and monitoring settings are valid.");
      console.log("No files, Web Push subscription, or scheduler were changed.");
      return;
    }
    const webPush = await pairWebPush(prompt, DEFAULT_WEB_PUSH_SETUP_URL);
    const config: MonitorConfig = {
      schemaVersion: 2,
      ...settings,
      provider: "web-push",
      webPush,
      codexPath: codex.path,
      nodePath: process.execPath,
      installedVersion: APP_VERSION,
      schedulerId: scheduler.id
    };
    const state = baselineState(snapshot, config.monitoredWindowKeys, await loadState(paths.stateFile));
    await installStableRuntime(fileURLToPath(import.meta.url), paths.runtimeFile);
    await saveConfig(paths.configFile, config);
    await saveState(paths.stateFile, state);
    await ensurePrivateDirectory(paths.logDir);
    await scheduler.install(schedulerConfig(config));
    await printSuccess(config, snapshot, false);
    if (await prompt.confirm("Send a test push now", true)) await sendTestPush(config);
  } finally {
    prompt.close();
  }
}

async function configureCommand(): Promise<void> {
  const config = await requireConfig();
  const prompt = new Prompt();
  try {
    const codex = await codexSource(prompt);
    const snapshot = await codex.source.read();
    const settings = await configureChoices(prompt, snapshot, config);
    const scheduler = await createScheduler(config.schedulerId);
    const updated: MonitorConfig = { ...config, ...settings, codexPath: codex.path, nodePath: process.execPath, schedulerId: scheduler.id };
    const state = baselineState(snapshot, updated.monitoredWindowKeys, await loadState(paths.stateFile));
    await saveConfig(paths.configFile, updated);
    await saveState(paths.stateFile, state);
    await ensurePrivateDirectory(paths.logDir);
    await scheduler.install(schedulerConfig(updated));
    console.log("Configuration saved and the scheduler was restarted.");
  } finally {
    prompt.close();
  }
}

async function checkCommand(): Promise<void> {
  const config = await requireConfig();
  const state = await loadState(paths.stateFile);
  await runCheck(config, {
    source: new CodexAppServerSource(config.codexPath),
    provider: createConfiguredProvider(config),
    recipients: configuredRecipients(config),
    state,
    statePath: paths.stateFile,
    lockPath: paths.lockFile,
    logger: new Logger(paths.logFile)
  });
  console.log(`Check complete: ${state.lastSnapshot?.windows.length ?? 0} windows discovered, ${config.monitoredWindowKeys.length} monitored.`);
}

async function statusCommand(): Promise<void> {
  const config = await loadConfig(paths.configFile);
  console.log(`Installed: ${config ? "yes" : "no"}`);
  if (!config) return;
  const state = await loadState(paths.stateFile);
  const scheduler = await createScheduler(config.schedulerId);
  const schedulerStatus = await scheduler.status().catch((error: Error) => ({ installed: false, running: false, adapter: scheduler.id, detail: error.message }));
  console.log(`Scheduler: ${schedulerStatus.adapter}, ${schedulerStatus.running ? "running" : "stopped"}${schedulerStatus.detail ? ` (${schedulerStatus.detail})` : ""}`);
  let snapshot = state.lastSnapshot;
  try {
    const source = new CodexAppServerSource(config.codexPath);
    const account = await source.readAccount();
    console.log(`Codex authentication: ${account.authenticated ? `ChatGPT${account.planType ? ` (${account.planType})` : ""}` : `not ready - ${account.reason ?? "run codex login"}`}`);
    if (account.authenticated) snapshot = await source.read();
  } catch (error) {
    console.log(`Codex authentication: unavailable - ${(error as Error).message}`);
  }
  console.log(`Provider: ${providerDisplayName(config)}`);
  console.log("Paired device: yes");
  console.log(`Setup app: ${config.webPush.setupUrl}`);
  console.log(`Polling interval: ${config.pollingIntervalMins} minutes`);
  console.log(`Scheduled alerts: ${config.notifyScheduled ? "on" : "off"}; unexpected alerts: ${config.notifyUnexpected ? "on" : "off"}`);
  console.log(`Last successful check: ${localTime(state.lastSuccessfulCheck)}`);
  if (state.lastCheckError) console.log(`Last check error: ${state.lastCheckError}`);
  console.log("\nDiscovered buckets:");
  for (const window of snapshot?.windows ?? []) {
    const monitored = config.monitoredWindowKeys.includes(window.key);
    const current = state.windows[window.key];
    console.log(`  ${describeWindow(window)}${monitored ? ` [monitored; peak ${current?.peakUsedPercent.toFixed(1) ?? "?"}%]` : " [not monitored]"}`);
  }
  const events = Object.entries(state.windows)
    .flatMap(([key, value]) => value.lastResetEvent ? [{ key, event: value.lastResetEvent }] : [])
    .sort((a, b) => b.event.detectedAt - a.event.detectedAt);
  const latest = events[0];
  console.log(`\nLast detected reset: ${latest ? `${latest.event.kind} for ${latest.key} at ${localTime(latest.event.observedResetAt)} (peak observed ${latest.event.peakUsedPercent.toFixed(1)}%)` : "none"}`);
  console.log(`Last notification: ${latest ? `${latest.event.notificationStatus}${latest.event.notificationError ? ` - ${latest.event.notificationError}` : ""}` : "none"}`);
}

function argumentValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function validatedSetupUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    url.hash = "";
    url.search = "";
    return url.href;
  } catch {
    throw new Error("The Web Push setup URL must be a valid HTTPS URL");
  }
}

async function pairWebPush(prompt: Prompt, requestedUrl: string, existing?: WebPushConfig): Promise<WebPushConfig> {
  const setupUrl = validatedSetupUrl(requestedUrl);
  const keys = existing
    ? { publicKey: existing.vapidPublicKey, privateKey: existing.vapidPrivateKey }
    : generateVapidKeys();
  const pairingUrl = new URL(setupUrl);
  pairingUrl.hash = `vapid=${encodeURIComponent(keys.publicKey)}`;

  console.log("\niPhone Web Push setup");
  console.log("  Web Push has no per-message fee.");
  console.log("  It requires iOS/iPadOS 16.4 or newer and an HTTPS Home Screen web app.");
  console.log("  The setup app does not upload or store your subscription; you copy it back here.\n");
  console.log("  1. Open this URL in Safari on your iPhone:");
  console.log(`     ${pairingUrl.href}`);
  console.log("     If the Home Screen app asks for a public key, paste this:");
  console.log(`     ${keys.publicKey}`);
  console.log("  2. Tap Share, then Add to Home Screen.");
  console.log("  3. Open Codex Reset Watch from the new Home Screen icon.");
  console.log("  4. Tap Enable Notifications, allow notifications, then tap Copy Pairing Code.");
  console.log("  5. Paste that pairing code below.\n");

  const code = await prompt.ask("iPhone pairing code");
  if (!code) throw new Error("No pairing code was entered");
  return {
    setupUrl,
    vapidSubject: new URL(setupUrl).origin,
    vapidPublicKey: keys.publicKey,
    vapidPrivateKey: keys.privateKey,
    subscription: decodeSubscriptionCode(code)
  };
}

async function setupWebPushCommand(args: string[]): Promise<void> {
  const config = await loadConfigForWebPushSetup(paths.configFile);
  if (!config) throw new Error("Codex Reset Watch is not installed. Run `npx codex-reset-watch install`.");
  const requestedUrl = argumentValue(args, "--url") ?? config.webPush?.setupUrl ?? DEFAULT_WEB_PUSH_SETUP_URL;
  const prompt = new Prompt();
  try {
    const webPush = await pairWebPush(prompt, requestedUrl, config.webPush);
    const updated: MonitorConfig = {
      schemaVersion: 2,
      provider: "web-push",
      ...config,
      notifyScheduled: false,
      nodePath: process.execPath,
      installedVersion: APP_VERSION,
      webPush
    };
    const scheduler = await createScheduler(updated.schedulerId);
    await installStableRuntime(fileURLToPath(import.meta.url), paths.runtimeFile);
    await saveConfig(paths.configFile, updated);
    await ensurePrivateDirectory(paths.logDir);
    await scheduler.install(schedulerConfig(updated));
    console.log("Web Push is paired and the scheduled monitor now uses it.");
    console.log("Scheduled-reset alerts were turned off; unexpected-reset alerts keep their existing setting.");
    if (await prompt.confirm("Send a test push now", true)) await sendTestPush(updated);
  } finally {
    prompt.close();
  }
}

async function sendTestPush(config: MonitorConfig): Promise<void> {
  console.log("Sending a Web Push test to the paired iPhone. Keep this command open until a final result appears.");
  const result = await sendWithRetry(
    createConfiguredProvider(config),
    { id: `test-push-${Date.now()}`, message: "Setup test succeeded. Codex Reset Watch can notify this iPhone." },
    configuredRecipients(config),
    {
      onAttempt(attempt, totalAttempts) {
        console.log(`Web Push attempt ${attempt} of ${totalAttempts}...`);
      },
      onRetry(details) {
        console.log(`Attempt ${details.attempt} failed: ${details.error}`);
        console.log(`Retrying in ${Math.ceil(details.delayMs / 1000)} seconds. Closing now cancels remaining retries.`);
      }
    }
  );
  if (result.status === "sent") {
    console.log("Apple's push service accepted the notification. No retry is queued; you may close this command.");
    console.log("Delivery to the device remains best effort. Check iOS notification permissions if it does not appear.");
  } else {
    console.log(`Final result: Web Push ${result.status}: ${result.error ?? "unknown error"}`);
    console.log("No further retry is queued; you may close this command.");
    process.exitCode = 1;
  }
}

async function testPushCommand(args: string[]): Promise<void> {
  const config = await requireConfig();
  if (!args.includes("--force")) {
    const prompt = new Prompt();
    try {
      if (!await prompt.confirm("Send a test push to the paired iPhone", true)) {
        console.log("Cancelled.");
        return;
      }
    } finally {
      prompt.close();
    }
  }
  await sendTestPush(config);
}

async function schedulerCommand(command: "start" | "stop" | "restart"): Promise<void> {
  const config = await requireConfig();
  const scheduler = await createScheduler(config.schedulerId);
  await scheduler[command]();
  console.log(`Scheduler ${command} complete.`);
}

async function removeKnownFiles(files: string[]): Promise<void> {
  for (const file of files) {
    await unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
}

async function uninstallCommand(): Promise<void> {
  const config = await loadConfigForWebPushSetup(paths.configFile);
  const scheduler = await createScheduler(config?.schedulerId);
  await scheduler.uninstall();
  await removeKnownFiles([paths.runtimeFile]);
  const prompt = new Prompt();
  try {
    const preserve = await prompt.confirm("Preserve local configuration and monitoring state", true);
    if (!preserve) {
      await removeKnownFiles([paths.configFile, paths.stateFile, paths.lockFile, paths.logFile, `${paths.logFile}.1`]);
      for (const directory of [paths.logDir, paths.configDir, paths.stateDir, paths.dataDir]) {
        await rmdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error; });
      }
      console.log("Scheduler, runtime, configuration, state, and known logs were removed. Codex authentication was untouched.");
    } else {
      console.log("Scheduler and installed runtime were removed; configuration and state were preserved.");
    }
  } finally { prompt.close(); }
}

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);
  switch (command) {
    case "install": await installCommand(args); break;
    case "configure": await configureCommand(); break;
    case "status": await statusCommand(); break;
    case "check": await checkCommand(); break;
    case "setup-web-push": await setupWebPushCommand(args); break;
    case "test-push": await testPushCommand(args); break;
    case "start": case "stop": case "restart": await schedulerCommand(command); break;
    case "uninstall": await uninstallCommand(); break;
    case "help": case "--help": case "-h": help(); break;
    case "--version": case "-v": console.log(APP_VERSION); break;
    default: help(); throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
