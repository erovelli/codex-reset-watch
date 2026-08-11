import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TextbeltFreeProvider } from "../../src/notifications/providers/textbelt.js";

const notification = { id: "event", message: "Codex Reset Watch test" };
const recipients = [{ phone: "+15551234567" }];

describe("Textbelt Free provider", () => {
  it("classifies the free daily quota response without retrying", async () => {
    const provider = new TextbeltFreeProvider(async () => new Response(JSON.stringify({
      success: false,
      error: "Only one free message is allowed per day"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await provider.send(notification, recipients);
    assert.equal(result.status, "quota-exhausted");
    assert.equal(result.retryable, undefined);
  });

  it("marks temporary 5xx provider failures retryable", async () => {
    const provider = new TextbeltFreeProvider(async () => new Response(JSON.stringify({
      success: false,
      error: "temporary failure"
    }), { status: 503, headers: { "content-type": "application/json" } }));
    const result = await provider.send(notification, recipients);
    assert.equal(result.status, "failed");
    assert.equal(result.retryable, true);
  });

  it("does not retry a country-level free-service restriction", async () => {
    const provider = new TextbeltFreeProvider(async () => new Response(JSON.stringify({
      success: false,
      error: "Sorry, free SMS are disabled for this country due to abuse."
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await provider.send(notification, recipients);
    assert.equal(result.status, "failed");
    assert.equal(result.retryable, undefined);
  });

  it("uses Textbelt's non-consuming _test key for validation", async () => {
    let requestBody = "";
    const provider = new TextbeltFreeProvider(async (_input, init) => {
      requestBody = String(init?.body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    const result = await provider.validateWithoutSending(recipients[0]!.phone);
    assert.equal(result.status, "sent");
    assert.match(requestBody, /key=textbelt_test/);
  });
});
