import webpush, { WebPushError, type SendResult, type VapidKeys } from "web-push";
import type {
  Notification,
  NotificationProvider,
  NotificationResult,
  NotificationRecipient,
  RetryDisposition,
  WebPushConfig,
  WebPushSubscription
} from "../../types.js";

export interface WebPushClient {
  generateVAPIDKeys(): VapidKeys;
  sendNotification(
    subscription: WebPushSubscription,
    payload: string,
    options: {
      TTL: number;
      urgency: "high";
      timeout: number;
      vapidDetails: { subject: string; publicKey: string; privateKey: string };
    }
  ): Promise<SendResult>;
}

export function generateVapidKeys(client: Pick<WebPushClient, "generateVAPIDKeys"> = webpush): VapidKeys {
  return client.generateVAPIDKeys();
}

function statusCode(error: unknown): number | undefined {
  if (error instanceof WebPushError) return error.statusCode;
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const value = (error as { statusCode?: unknown }).statusCode;
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

export class IosWebPushProvider implements NotificationProvider {
  readonly id = "web-push";

  constructor(private readonly config: WebPushConfig, private readonly client: WebPushClient = webpush) {}

  classifyFailure(error: unknown): RetryDisposition {
    const code = statusCode(error);
    if (code === 404 || code === 410 || (code !== undefined && code >= 400 && code < 500 && code !== 408 && code !== 429)) {
      return "permanent";
    }
    return "transient";
  }

  async send(notification: Notification, recipients: NotificationRecipient[]): Promise<NotificationResult> {
    if (recipients.length === 0) return { status: "failed", error: "No Web Push recipient configured" };
    if (recipients.length > 1) return { status: "failed", error: "Web Push v1 supports one subscribed device" };
    const recipient = recipients[0];
    const subscription = recipient?.channel === "web-push" ? recipient.subscription : undefined;
    if (!subscription) return { status: "failed", error: "The iPhone Web Push subscription is missing" };
    const payload = JSON.stringify({
      title: "Codex Reset Watch",
      body: notification.message,
      tag: notification.id,
      url: "./"
    });
    try {
      const result = await this.client.sendNotification(subscription, payload, {
        TTL: 86_400,
        urgency: "high",
        timeout: 15_000,
        vapidDetails: {
          subject: this.config.vapidSubject,
          publicKey: this.config.vapidPublicKey,
          privateKey: this.config.vapidPrivateKey
        }
      });
      const messageId = result.headers["apns-id"] ?? result.headers.location;
      return { status: "sent", ...(messageId ? { providerMessageId: messageId } : {}) };
    } catch (error) {
      if (this.classifyFailure(error) === "permanent") {
        const code = statusCode(error);
        return {
          status: "failed",
          error: `${error instanceof Error ? error.message : String(error)}${code === 404 || code === 410 ? "; the iPhone subscription expired, so run setup-web-push again" : ""}`
        };
      }
      throw error;
    }
  }
}
