import type { WebPushSubscription } from "../types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validBase64UrlBytes(value: string, expectedLength: number, firstByte?: number): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === expectedLength
    && decoded.toString("base64url") === value
    && (firstByte === undefined || decoded[0] === firstByte);
}

export function validateWebPushSubscription(value: unknown): WebPushSubscription {
  if (!isRecord(value)) throw new Error("Web Push subscription must be an object");
  if (typeof value.endpoint !== "string" || value.endpoint.length > 4096) {
    throw new Error("Web Push subscription endpoint is missing or invalid");
  }
  try {
    const endpoint = new URL(value.endpoint);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error();
  } catch (error) {
    throw new Error("Web Push subscription endpoint is missing or invalid", { cause: error });
  }
  if (!isRecord(value.keys) || typeof value.keys.p256dh !== "string" || typeof value.keys.auth !== "string") {
    throw new Error("Web Push subscription encryption keys are missing");
  }
  if (!validBase64UrlBytes(value.keys.p256dh, 65, 4) || !validBase64UrlBytes(value.keys.auth, 16)) {
    throw new Error("Web Push subscription encryption keys are invalid");
  }
  const expirationTime = value.expirationTime;
  if (expirationTime !== undefined && expirationTime !== null && (
    typeof expirationTime !== "number" || !Number.isFinite(expirationTime) || expirationTime < 0
  )) {
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
    const trimmed = code.trim();
    if (trimmed.length === 0 || trimmed.length > 32_768 || !/^[A-Za-z0-9_-]+$/.test(trimmed)) throw new Error();
    const decoded = Buffer.from(trimmed, "base64url").toString("utf8");
    return validateWebPushSubscription(JSON.parse(decoded));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Web Push")) throw error;
    throw new Error("The iPhone pairing code is invalid or incomplete", { cause: error });
  }
}
