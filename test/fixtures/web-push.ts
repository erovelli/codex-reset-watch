const uncompressedPoint = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64url");

export const webPushFixture = {
  setupUrl: "https://example.com/reset-watch/",
  vapidSubject: "https://example.com",
  vapidPublicKey: uncompressedPoint,
  vapidPrivateKey: Buffer.alloc(32, 2).toString("base64url"),
  subscription: {
    endpoint: "https://web.push.apple.com/example",
    expirationTime: null,
    keys: {
      p256dh: uncompressedPoint,
      auth: Buffer.alloc(16, 3).toString("base64url")
    }
  }
};
