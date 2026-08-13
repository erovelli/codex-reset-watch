import type { MonitorConfig, NotificationProvider, NotificationRecipient } from "../types.js";
import { IosWebPushProvider } from "./providers/web-push.js";

export function createConfiguredProvider(config: MonitorConfig): NotificationProvider {
  return new IosWebPushProvider(config.webPush);
}

export function configuredRecipients(config: MonitorConfig): NotificationRecipient[] {
  return [{ channel: "web-push", subscription: config.webPush.subscription }];
}

export function providerDisplayName(_config: MonitorConfig): string {
  return "iOS Web Push";
}
