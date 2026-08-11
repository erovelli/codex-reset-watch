import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeSubscriptionCode, encodeSubscriptionCode } from "../../src/notifications/web-push-pairing.js";
import type { WebPushSubscription } from "../../src/types.js";

const subscription: WebPushSubscription = {
  endpoint: "https://web.push.apple.com/Q-example",
  expirationTime: null,
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK8gN6Lyt6Sl9A-example",
    auth: "tBHItJI5svbpez7KI4CCXg"
  }
};

describe("Web Push pairing code", () => {
  it("round-trips an iOS PushSubscription without changing it", () => {
    assert.deepEqual(decodeSubscriptionCode(encodeSubscriptionCode(subscription)), subscription);
  });

  it("rejects malformed or incomplete pairing codes", () => {
    assert.throws(() => decodeSubscriptionCode("not-a-subscription"), /invalid or incomplete/);
    const incomplete = Buffer.from(JSON.stringify({ endpoint: "https://example.com" })).toString("base64url");
    assert.throws(() => decodeSubscriptionCode(incomplete), /encryption keys/);
  });
});
