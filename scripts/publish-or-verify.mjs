/* global URL, console, process */
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const specifier = `${packageJson.name}@${packageJson.version}`;
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

let publishedHead;
try {
  publishedHead = JSON.parse(execFileSync("npm", ["view", specifier, "gitHead", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }));
} catch (error) {
  const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
  if (!/E404|Not Found/i.test(stderr)) throw error;
}

if (publishedHead !== undefined) {
  if (publishedHead !== head) {
    throw new Error(`${specifier} is already published from ${String(publishedHead)}, not release commit ${head}`);
  }
  console.log(`${specifier} is already published from this release commit; no duplicate publish was attempted.`);
} else {
  const result = spawnSync("npm", ["publish"], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm publish exited with status ${String(result.status)}`);
}
