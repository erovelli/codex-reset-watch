import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cronSchedules } from "../../src/scheduler/linux-cron.js";

describe("cron fallback schedule", () => {
  it("represents the 30-minute default with one lightweight cron line", () => {
    assert.deepEqual(cronSchedules(30), ["0,30 * * * *"]);
  });

  it("represents a 90-minute interval without rounding it to whole hours", () => {
    assert.deepEqual(cronSchedules(90), [
      "0 0,3,6,9,12,15,18,21 * * *",
      "30 1,4,7,10,13,16,19,22 * * *"
    ]);
  });
});
