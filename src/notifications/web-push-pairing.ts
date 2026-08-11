import type { WebPushSubscription } from "../types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateWebPushSubscription(value: unknown): WebPushSubscription {
  if (!isRecord(value)) throw new Error("Web Push subscription must be an object");
  if (typeof value.endpoint !== "string" || !value.endpoint.startsWith("https://")) {
    throw new Error("Web Push subscription endpoint is missing or invalid");
  }
  if (!isRecord(value.keys) || typeof value.keys.p256dh !== "string" || typeof value.keys.auth !== "string") {
    throw new Error("Web Push subscription encryption keys are missing");
  }
  if (value.keys.p256dh.length < 20 || value.keys.auth.length < 8) {
    throw new Error("Web Push subscription encryption keys are invalid");
  }
  const expirationTime = value.expirationTime;
  if (expirationTime !== undefined && expirationTime !== null && typeof expirationTime !== "number") {
    throw new Error("Web Push subscription expirationTime is invalid");
  }
  return {
    endpoint: value.endpoint,
    ...(expirationTime === undefined ? {} : { expirationTime }),
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth }
  };
}

export function encodeSubscriptionCode(subscription: WebPushSubscription): string {
  return Buffer.from(JSON.stringify(subscription), "utf8").toString("base64url");
}

export function decodeSubscriptionCode(code: string): WebPushSubscription {
  try {
    const decoded = Buffer.from(code.trim(), "base64url").toString("utf8");
    return validateWebPushSubscription(JSON.parse(decoded));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Web Push")) throw error;
    throw new Error("The iPhone pairing code is invalid or incomplete");
  }
}
