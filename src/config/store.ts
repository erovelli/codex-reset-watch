import type { MonitorConfig } from "../types.js";
import { validateWebPushSubscription } from "../notifications/web-push-pairing.js";
import { atomicWriteJson, readJsonFile } from "../state/json-store.js";

function validStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function validateConfig(value: unknown): MonitorConfig {
  if (typeof value !== "object" || value === null) throw new Error("Configuration is not an object");
  const raw = value as Record<string, unknown>;
  const requiredStrings = ["provider", "codexPath", "nodePath", "installedVersion", "schedulerId"] as const;
  for (const field of requiredStrings) {
    if (typeof raw[field] !== "string" || raw[field].length === 0) {
      throw new Error(`Configuration field ${field} is missing`);
    }
  }
  if (!validStringArray(raw.monitoredWindowKeys)) throw new Error("Configuration monitoredWindowKeys is invalid");
  for (const field of ["pollingIntervalMins", "gracePeriodMins", "acceptedSmsTermsAt"] as const) {
    if (typeof raw[field] !== "number" || !Number.isFinite(raw[field])) {
      throw new Error(`Configuration field ${field} is invalid`);
    }
  }
  if (typeof raw.notifyUnexpected !== "boolean" || typeof raw.notifyScheduled !== "boolean") {
    throw new Error("Configuration notification settings are invalid");
  }
  if (raw.provider !== "textbelt-free" && raw.provider !== "web-push") {
    throw new Error(`Unsupported notification provider: ${String(raw.provider)}`);
  }
  if (raw.provider === "textbelt-free" && (typeof raw.phone !== "string" || raw.phone.length === 0)) {
    throw new Error("Configuration field phone is missing");
  }
  if (raw.provider === "web-push") {
    if (typeof raw.webPush !== "object" || raw.webPush === null) {
      throw new Error("Web Push configuration is missing");
    }
    const push = raw.webPush as Record<string, unknown>;
    for (const field of ["setupUrl", "vapidSubject", "vapidPublicKey", "vapidPrivateKey"] as const) {
      if (typeof push[field] !== "string" || push[field].length === 0) {
        throw new Error(`Web Push configuration field ${field} is missing`);
      }
    }
    try {
      const setup = new URL(push.setupUrl as string);
      if (setup.protocol !== "https:") throw new Error();
    } catch {
      throw new Error("Web Push setup URL must use HTTPS");
    }
    validateWebPushSubscription(push.subscription);
  }
  if (raw.schemaVersion !== 1) throw new Error(`Unsupported configuration schema: ${String(raw.schemaVersion)}`);
  return raw as unknown as MonitorConfig;
}

export async function loadConfig(path: string): Promise<MonitorConfig | undefined> {
  const value = await readJsonFile<unknown>(path);
  return value === undefined ? undefined : validateConfig(value);
}

export async function saveConfig(path: string, config: MonitorConfig): Promise<void> {
  await atomicWriteJson(path, config);
}
