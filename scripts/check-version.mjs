/* global URL, console, process */
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const version = packageJson.version;

if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`package.json contains an invalid release version: ${String(version)}`);
}

const tag = process.argv[2];
if (tag !== undefined && tag !== `v${version}`) {
  throw new Error(`Release tag ${tag} does not match package version v${version}`);
}

console.log(tag === undefined ? `Release version: ${version}` : `Release tag matches package version: ${tag}`);
