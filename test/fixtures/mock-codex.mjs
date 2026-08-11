import readline from "node:readline";

const lines = readline.createInterface({ input: process.stdin });
for await (const line of lines) {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    process.stdout.write(`${JSON.stringify({ id: message.id, result: { userAgent: "mock" } })}\n`);
  } else if (message.method === "account/read") {
    process.stdout.write(`${JSON.stringify({ id: message.id, result: { account: { type: "chatgpt", planType: "plus" }, requiresOpenaiAuth: true } })}\n`);
  } else if (message.method === "account/rateLimits/read") {
    process.stdout.write(`${JSON.stringify({
      id: message.id,
      result: {
        rateLimits: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 1_900_000_000 } },
        rateLimitsByLimitId: {
          codex: {
            limitId: "codex",
            primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 1_900_000_000 },
            secondary: { usedPercent: 25, windowDurationMins: 10080, resetsAt: 1_900_500_000 }
          }
        }
      }
    })}\n`);
  }
}
