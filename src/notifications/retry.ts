import type {
  Notification,
  NotificationProvider,
  NotificationResult,
  NotificationRecipient
} from "../types.js";

export interface RetryOptions {
  delaysMs?: number[];
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  onAttempt?: (attempt: number, totalAttempts: number) => void | Promise<void>;
  onRetry?: (details: {
    attempt: number;
    totalAttempts: number;
    error: string;
    delayMs: number;
  }) => void | Promise<void>;
}

const defaultDelays = [30_000, 60_000, 120_000, 240_000, 480_000];
const defaultSleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function sendWithRetry(
  provider: NotificationProvider,
  notification: Notification,
  recipients: NotificationRecipient[],
  options: RetryOptions = {}
): Promise<NotificationResult> {
  const delays = options.delaysMs ?? defaultDelays;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  let lastError = "notification failed";
  const totalAttempts = delays.length + 1;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    await options.onAttempt?.(attempt + 1, totalAttempts);
    try {
      const result = await provider.send(notification, recipients);
      if (result.status !== "failed" || !result.retryable) return result;
      lastError = result.error ?? lastError;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (provider.classifyFailure(error) === "permanent") {
        return { status: "failed", error: lastError };
      }
    }
    if (attempt === delays.length) break;
    const base = delays[attempt];
    if (base === undefined) break;
    const jittered = Math.round(base * (0.8 + random() * 0.4));
    await options.onRetry?.({
      attempt: attempt + 1,
      totalAttempts,
      error: lastError,
      delayMs: jittered
    });
    await sleep(jittered);
  }
  return { status: "failed", error: `${lastError} (retry budget exhausted)` };
}
