import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cronEntries, cronSchedules, withoutManaged } from "../../src/scheduler/linux-cron.js";
import { cronShellQuote } from "../../src/scheduler/file-utils.js";

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

  it("uses an epoch guard for intervals that do not divide evenly across midnight", () => {
    assert.deepEqual(cronEntries(100, "run-check"), [
      "*/20 * * * * test $(( $(date +\\%s) / 60 \\% 100 )) -eq 0 && run-check"
    ]);
  });

  it("fails closed instead of deleting user jobs around malformed markers", () => {
    assert.throws(
      () => withoutManaged("0 * * * * backup\n# codex-reset-watch managed start\n30 * * * * check\n15 * * * * report\n"),
      /markers are malformed/
    );
  });

  it("removes only a complete managed block and escapes cron percent characters", () => {
    const content = "0 * * * * backup\n# codex-reset-watch managed start\n30 * * * * check\n# codex-reset-watch managed end\n15 * * * * report\n";
    assert.equal(withoutManaged(content), "0 * * * * backup\n15 * * * * report");
    assert.equal(cronShellQuote("/Users/percent%name/node", "Node path"), "'/Users/percent\\%name/node'");
  });
});
