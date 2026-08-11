import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRateLimitsResponse } from "../../src/codex/parser.js";

describe("App Server rate-limit parser", () => {
  it("normalizes multiple IDs and all window kinds without duplicating the legacy view", () => {
    const windows = parseRateLimitsResponse({
      rateLimits: {
        limitId: "codex",
        primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1000 },
        secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 2000 }
      },
      rateLimitsByLimitId: {
        codex: {
          limitId: "codex",
          limitName: "Codex",
          primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1000 },
          secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 2000 }
        },
        reviews: {
          limitId: "reviews",
          primary: { usedPercent: 10, windowDurationMins: 1440, resetsAt: 3000 },
          burst: { usedPercent: 5, windowDurationMins: 60, resetsAt: 4000 }
        }
      }
    });
    assert.deepEqual(windows.map((entry) => entry.key), [
      "codex:primary",
      "codex:secondary",
      "reviews:primary",
      "reviews:burst"
    ]);
  });

  it("fails clearly when a reported window loses required fields", () => {
    assert.throws(
      () => parseRateLimitsResponse({ rateLimits: { limitId: "codex", primary: { usedPercent: 1 } } }),
      /windowDurationMins/
    );
  });
});
