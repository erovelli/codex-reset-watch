import type { MonitorConfig, NotificationProvider, Recipient } from "../types.js";
import { TextbeltFreeProvider } from "./providers/textbelt.js";
import { IosWebPushProvider } from "./providers/web-push.js";

export function createConfiguredProvider(config: MonitorConfig): NotificationProvider {
  if (config.provider === "web-push") {
    if (!config.webPush) throw new Error("Web Push is selected but not paired. Run `codex-reset-watch setup-web-push`.");
    return new IosWebPushProvider(config.webPush);
  }
  return new TextbeltFreeProvider();
}

export function configuredRecipients(config: MonitorConfig): Recipient[] {
  if (config.provider === "web-push") {
    if (!config.webPush) return [];
    return [{ webPushSubscription: config.webPush.subscription }];
  }
  return [{ phone: config.phone }];
}

export function providerDisplayName(config: MonitorConfig): string {
  return config.provider === "web-push" ? "iOS Web Push" : "Textbelt Free";
}
