import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IosWebPushProvider, type WebPushClient } from "../../src/notifications/providers/web-push.js";
import type { WebPushConfig } from "../../src/types.js";

const subscription = {
  endpoint: "https://web.push.apple.com/Q-example",
  expirationTime: null,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK8gN6Lyt6Sl9A-example", auth: "tBHItJI5svbpez7KI4CCXg" }
};
const config: WebPushConfig = {
  setupUrl: "https://example.com/push/",
  vapidSubject: "https://example.com/push/",
  vapidPublicKey: "public-key",
  vapidPrivateKey: "private-key",
  subscription
};

function client(send: WebPushClient["sendNotification"]): WebPushClient {
  return { generateVAPIDKeys: () => ({ publicKey: "public", privateKey: "private" }), sendNotification: send };
}

describe("iOS Web Push provider", () => {
  it("sends an encrypted visible notification with VAPID details", async () => {
    let payload = "";
    const provider = new IosWebPushProvider(config, client(async (_subscription, body, options) => {
      payload = body;
      assert.equal(options.urgency, "high");
      assert.equal(options.vapidDetails.privateKey, "private-key");
      return { statusCode: 201, body: "", headers: { "apns-id": "push-123" } };
    }));
    const result = await provider.send({ id: "reset-1", message: "Unexpected weekly reset" }, [{ webPushSubscription: subscription }]);
    assert.equal(result.status, "sent");
    assert.equal(result.providerMessageId, "push-123");
    assert.deepEqual(JSON.parse(payload), {
      title: "Codex Reset Watch",
      body: "Unexpected weekly reset",
      tag: "reset-1",
      url: "./"
    });
  });

  it("treats an expired Apple subscription as permanent", async () => {
    const provider = new IosWebPushProvider(config, client(async () => {
      throw Object.assign(new Error("subscription gone"), { statusCode: 410 });
    }));
    const result = await provider.send({ id: "reset-1", message: "test" }, [{ webPushSubscription: subscription }]);
    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /setup-web-push again/);
  });

  it("classifies temporary Apple push failures for bounded retry", async () => {
    const provider = new IosWebPushProvider(config, client(async () => {
      throw Object.assign(new Error("unavailable"), { statusCode: 503 });
    }));
    await assert.rejects(() => provider.send({ id: "reset-1", message: "test" }, [{ webPushSubscription: subscription }]));
    assert.equal(provider.classifyFailure({ statusCode: 503 }), "transient");
  });
});
