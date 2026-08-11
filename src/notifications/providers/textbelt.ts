import type {
  Notification,
  NotificationProvider,
  NotificationResult,
  Recipient,
  RetryDisposition
} from "../../types.js";

class TextbeltError extends Error {
  constructor(message: string, readonly disposition: RetryDisposition) {
    super(message);
  }
}

interface TextbeltBody {
  success?: boolean;
  textId?: string;
  error?: string;
}

type FetchLike = typeof fetch;

export class TextbeltFreeProvider implements NotificationProvider {
  readonly id = "textbelt-free";

  constructor(private readonly fetcher: FetchLike = fetch) {}

  classifyFailure(error: unknown): RetryDisposition {
    return error instanceof TextbeltError ? error.disposition : "transient";
  }

  async send(notification: Notification, recipients: Recipient[]): Promise<NotificationResult> {
    if (recipients.length === 0) return { status: "failed", error: "No recipients configured" };
    if (recipients.length > 1) return { status: "failed", error: "Textbelt Free v1 supports one recipient" };
    const recipient = recipients[0];
    if (!recipient?.phone) return { status: "failed", error: "No phone recipient configured" };
    let response: Response;
    try {
      response = await this.fetcher("https://textbelt.com/text", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ phone: recipient.phone, message: notification.message, key: "textbelt" }),
        signal: AbortSignal.timeout(15_000)
      });
    } catch (error) {
      throw new TextbeltError(error instanceof Error ? error.message : String(error), "transient");
    }
    let body: TextbeltBody;
    try {
      body = (await response.json()) as TextbeltBody;
    } catch {
      throw new TextbeltError(`Textbelt returned invalid JSON (HTTP ${response.status})`, response.status >= 500 ? "transient" : "permanent");
    }
    if (body.success === true) {
      return { status: "sent", ...(typeof body.textId === "string" ? { providerMessageId: body.textId } : {}) };
    }
    const message = body.error ?? `Textbelt rejected the request (HTTP ${response.status})`;
    if (/quota|one .* per day|daily .*limit/i.test(message)) {
      return { status: "quota-exhausted", error: message };
    }
    if (/free sms .*disabled|disabled .*country|country .*disabled|due to abuse|not available .*country/i.test(message)) {
      return { status: "failed", error: message };
    }
    if (/invalid.*(phone|number)|missing.*(phone|message|key)|not supported|opt.?out|unsubscrib/i.test(message)) {
      return { status: "failed", error: message };
    }
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      return { status: "failed", error: message, retryable: true };
    }
    if (response.status >= 400 && response.status < 500) return { status: "failed", error: message };
    return { status: "failed", error: message, retryable: true };
  }

  async validateWithoutSending(phone: string): Promise<NotificationResult> {
    const response = await this.fetcher("https://textbelt.com/text", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        phone,
        message: "Codex Reset Watch validation",
        key: "textbelt_test"
      }),
      signal: AbortSignal.timeout(15_000)
    });
    const body = (await response.json()) as TextbeltBody;
    return body.success
      ? { status: "sent" }
      : { status: "failed", error: body.error ?? `Textbelt validation failed (HTTP ${response.status})` };
  }
}
