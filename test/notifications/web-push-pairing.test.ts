import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeSubscriptionCode, encodeSubscriptionCode } from "../../src/notifications/web-push-pairing.js";
import type { WebPushSubscription } from "../../src/types.js";
import { webPushFixture } from "../fixtures/web-push.js";

const subscription: WebPushSubscription = webPushFixture.subscription;

describe("Web Push pairing code", () => {
  it("round-trips an iOS PushSubscription without changing it", () => {
    assert.deepEqual(decodeSubscriptionCode(encodeSubscriptionCode(subscription)), subscription);
  });

  it("rejects malformed or incomplete pairing codes", () => {
    assert.throws(() => decodeSubscriptionCode("not-a-subscription"), /invalid or incomplete/);
    const incomplete = Buffer.from(JSON.stringify({ endpoint: "https://example.com" })).toString("base64url");
    assert.throws(() => decodeSubscriptionCode(incomplete), /encryption keys/);
    assert.throws(() => decodeSubscriptionCode("a".repeat(32_769)), /invalid or incomplete/);
  });

  it("rejects unsafe endpoints and malformed encryption keys", () => {
    const unsafe = Buffer.from(JSON.stringify({
      ...subscription,
      endpoint: "https://user:password@example.com/push"
    })).toString("base64url");
    assert.throws(() => decodeSubscriptionCode(unsafe), /endpoint/);
    const malformedKeys = Buffer.from(JSON.stringify({
      ...subscription,
      keys: { ...subscription.keys, auth: "not valid!" }
    })).toString("base64url");
    assert.throws(() => decodeSubscriptionCode(malformedKeys), /keys are invalid/);
  });
});
