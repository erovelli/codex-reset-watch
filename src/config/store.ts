import type { MonitorConfig, WebPushConfig } from "../types.js";
import { validateWebPushSubscription } from "../notifications/web-push-pairing.js";
import { atomicWriteJson, readJsonFile } from "../state/json-store.js";

export type WebPushSetupConfig = Omit<MonitorConfig, "schemaVersion" | "provider" | "webPush"> & {
  webPush?: WebPushConfig;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(raw: Record<string, unknown>, field: string): string {
  const value = raw[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Configuration field ${field} is missing`);
  }
  return value;
}

function boundedInteger(raw: Record<string, unknown>, field: string, minimum: number, maximum: number): number {
  const value = raw[field];
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`Configuration field ${field} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function validateWebPush(value: unknown): WebPushConfig {
  const raw = record(value, "Web Push configuration");
  const setupUrl = requiredString(raw, "setupUrl");
  const vapidSubject = requiredString(raw, "vapidSubject");
  const vapidPublicKey = requiredString(raw, "vapidPublicKey");
  const vapidPrivateKey = requiredString(raw, "vapidPrivateKey");
  try {
    const setup = new URL(setupUrl);
    if (setup.protocol !== "https:" || setup.username || setup.password) throw new Error();
  } catch {
    throw new Error("Web Push setup URL must use HTTPS");
  }
  try {
    const subject = new URL(vapidSubject);
    if (subject.protocol !== "https:" && subject.protocol !== "mailto:") throw new Error();
  } catch {
    throw new Error("Web Push VAPID subject must be an HTTPS URL or mailto address");
  }
  const base64Url = /^[A-Za-z0-9_-]+$/;
  if (vapidPublicKey.length < 80 || vapidPublicKey.length > 128 || !base64Url.test(vapidPublicKey)) {
    throw new Error("Web Push VAPID public key is invalid");
  }
  if (vapidPrivateKey.length < 40 || vapidPrivateKey.length > 128 || !base64Url.test(vapidPrivateKey)) {
    throw new Error("Web Push VAPID private key is invalid");
  }
  return {
    setupUrl,
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey,
    subscription: validateWebPushSubscription(raw.subscription)
  };
}

function validateCommon(raw: Record<string, unknown>): WebPushSetupConfig {
  const monitored = raw.monitoredWindowKeys;
  if (!Array.isArray(monitored) || monitored.length === 0 || monitored.some((key) => typeof key !== "string" || key.length === 0)) {
    throw new Error("Configuration monitoredWindowKeys must contain at least one non-empty key");
  }
  const monitoredWindowKeys = [...new Set(monitored as string[])];
  if (monitoredWindowKeys.length !== monitored.length) {
    throw new Error("Configuration monitoredWindowKeys contains duplicates");
  }
  if (typeof raw.notifyUnexpected !== "boolean" || typeof raw.notifyScheduled !== "boolean") {
    throw new Error("Configuration notification settings are invalid");
  }
  return {
    pollingIntervalMins: boundedInteger(raw, "pollingIntervalMins", 5, 1440),
    gracePeriodMins: boundedInteger(raw, "gracePeriodMins", 0, 1440),
    notifyUnexpected: raw.notifyUnexpected,
    notifyScheduled: raw.notifyScheduled,
    monitoredWindowKeys,
    codexPath: requiredString(raw, "codexPath"),
    nodePath: requiredString(raw, "nodePath"),
    installedVersion: requiredString(raw, "installedVersion"),
    schedulerId: requiredString(raw, "schedulerId"),
    ...(raw.webPush === undefined ? {} : { webPush: validateWebPush(raw.webPush) })
  };
}

function fromSetupConfig(config: WebPushSetupConfig): MonitorConfig {
  if (!config.webPush) throw new Error("Web Push configuration is missing");
  return { schemaVersion: 2, provider: "web-push", ...config, webPush: config.webPush };
}

export function validateConfig(value: unknown): MonitorConfig {
  const raw = record(value, "Configuration");
  if (raw.schemaVersion !== 2) {
    throw new Error(`Unsupported configuration schema: ${String(raw.schemaVersion)}`);
  }
  if (raw.provider !== "web-push") {
    throw new Error(`Unsupported notification provider: ${String(raw.provider)}`);
  }
  return fromSetupConfig(validateCommon(raw));
}

function configForWebPushSetup(value: unknown): WebPushSetupConfig {
  const raw = record(value, "Configuration");
  if (raw.schemaVersion === 2) return validateConfig(raw);
  if (raw.schemaVersion !== 1) {
    throw new Error(`Unsupported configuration schema: ${String(raw.schemaVersion)}`);
  }
  if (raw.provider !== "web-push" && raw.provider !== "textbelt-free") {
    throw new Error(`Unsupported legacy notification provider: ${String(raw.provider)}`);
  }
  return validateCommon(raw);
}

export async function loadConfig(path: string): Promise<MonitorConfig | undefined> {
  const value = await readJsonFile<unknown>(path);
  if (value === undefined) return undefined;
  const raw = record(value, "Configuration");
  if (raw.schemaVersion === 1 && raw.provider === "web-push") {
    return fromSetupConfig(configForWebPushSetup(raw));
  }
  if (raw.schemaVersion === 1 && raw.provider === "textbelt-free") {
    throw new Error("This installation still uses the removed SMS provider. Run `codex-reset-watch setup-web-push` to migrate it.");
  }
  return validateConfig(raw);
}

export async function loadConfigForWebPushSetup(path: string): Promise<WebPushSetupConfig | undefined> {
  const value = await readJsonFile<unknown>(path);
  return value === undefined ? undefined : configForWebPushSetup(value);
}

export async function saveConfig(path: string, config: MonitorConfig): Promise<void> {
  await atomicWriteJson(path, validateConfig(config));
}
