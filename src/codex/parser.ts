import type { RateLimitWindow } from "../types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredNumber(record: Record<string, unknown>, field: string, context: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Codex App Server schema changed: ${context}.${field} must be a finite number`);
  }
  return value;
}

const bucketMetadata = new Set([
  "limitId",
  "limitName",
  "credits",
  "individualLimit",
  "spendControlReached",
  "planType",
  "rateLimitReachedType"
]);

function parseBucket(bucketKey: string, raw: unknown): RateLimitWindow[] {
  if (!isRecord(raw)) throw new Error(`Codex App Server schema changed: bucket ${bucketKey} is not an object`);
  const rawLimitId = raw.limitId;
  const limitId = typeof rawLimitId === "string" && rawLimitId.length > 0 ? rawLimitId : bucketKey;
  const limitName = typeof raw.limitName === "string" && raw.limitName.length > 0 ? raw.limitName : undefined;
  const windows: RateLimitWindow[] = [];

  for (const [windowKind, candidate] of Object.entries(raw)) {
    if (bucketMetadata.has(windowKind) || candidate === null || candidate === undefined) continue;
    if (!isRecord(candidate)) continue;
    const resemblesWindow =
      windowKind === "primary" ||
      windowKind === "secondary" ||
      "usedPercent" in candidate ||
      "windowDurationMins" in candidate ||
      "resetsAt" in candidate;
    if (!resemblesWindow) continue;
    const usedPercent = requiredNumber(candidate, "usedPercent", `${limitId}.${windowKind}`);
    const windowDurationMins = requiredNumber(candidate, "windowDurationMins", `${limitId}.${windowKind}`);
    const resetsAt = requiredNumber(candidate, "resetsAt", `${limitId}.${windowKind}`);
    if (windowDurationMins <= 0 || resetsAt <= 0 || usedPercent < 0) {
      throw new Error(`Codex App Server returned invalid values for ${limitId}.${windowKind}`);
    }
    windows.push({
      key: `${limitId}:${windowKind}`,
      limitId,
      ...(limitName === undefined ? {} : { limitName }),
      windowKind,
      usedPercent,
      windowDurationMins,
      resetsAt
    });
  }
  return windows;
}

export function parseRateLimitsResponse(value: unknown): RateLimitWindow[] {
  if (!isRecord(value)) throw new Error("Codex App Server schema changed: rate-limit response is not an object");
  const multi = value.rateLimitsByLimitId;
  const windows: RateLimitWindow[] = [];
  if (isRecord(multi) && Object.keys(multi).length > 0) {
    for (const [bucketKey, bucket] of Object.entries(multi)) windows.push(...parseBucket(bucketKey, bucket));
  } else if (value.rateLimits !== undefined) {
    const legacy = value.rateLimits;
    const fallbackKey = isRecord(legacy) && typeof legacy.limitId === "string" ? legacy.limitId : "codex";
    windows.push(...parseBucket(fallbackKey, legacy));
  } else {
    throw new Error("Codex App Server schema changed: rateLimits and rateLimitsByLimitId are missing");
  }
  if (windows.length === 0) throw new Error("Codex App Server returned no complete rate-limit windows");
  return windows;
}

export function parseAccountResponse(value: unknown): { accountType?: string; planType?: string } {
  if (!isRecord(value)) throw new Error("Codex App Server schema changed: account response is not an object");
  if (value.account === null) return {};
  if (!isRecord(value.account)) throw new Error("Codex App Server schema changed: account is invalid");
  const type = value.account.type;
  if (typeof type !== "string") throw new Error("Codex App Server schema changed: account.type is missing");
  const planType = typeof value.account.planType === "string" ? value.account.planType : undefined;
  return { accountType: type, ...(planType === undefined ? {} : { planType }) };
}
