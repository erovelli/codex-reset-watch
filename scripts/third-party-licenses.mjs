import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const missingLicenseText = {
  http_ece: `The MIT License (MIT)

Copyright (c) 2015 Martin Thomson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
};

function packageNameForInput(input) {
  const marker = "node_modules/";
  const index = input.lastIndexOf(marker);
  if (index < 0) return undefined;
  const parts = input.slice(index + marker.length).split("/");
  return parts[0]?.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

async function licenseText(packageName) {
  const directory = join(repositoryRoot, "node_modules", packageName);
  const files = await readdir(directory);
  const licenseFile = files.find((file) => /^(license|licence|copying|notice)(\.|$)/i.test(file));
  if (licenseFile) return readFile(join(directory, licenseFile), "utf8");
  const fallback = missingLicenseText[packageName];
  if (fallback) return fallback;
  throw new Error(`Bundled package ${packageName} does not include a recognizable license file`);
}

function repositoryUrl(repository) {
  if (typeof repository === "string") return repository;
  if (repository && typeof repository.url === "string") return repository.url;
  return "not specified";
}

function normalizedLicenseText(value) {
  return value.trim().split(/\r?\n/).map((line) => line.trimEnd()).join("\n");
}

export async function writeThirdPartyLicenses(metafile) {
  const packages = [...new Set(Object.keys(metafile.inputs).map(packageNameForInput).filter(Boolean))].sort();
  const sections = [];
  for (const packageName of packages) {
    const packageJson = JSON.parse(await readFile(join(repositoryRoot, "node_modules", packageName, "package.json"), "utf8"));
    sections.push([
      "================================================================================",
      `${packageName} ${packageJson.version}`,
      `License: ${packageJson.license ?? "not specified"}`,
      `Source: ${repositoryUrl(packageJson.repository)}`,
      "================================================================================",
      "",
      normalizedLicenseText(await licenseText(packageName)),
      ""
    ].join("\n"));
  }
  const content = [
    "THIRD-PARTY SOFTWARE LICENSES",
    "",
    "Codex Reset Watch's executable bundle contains the packages listed below.",
    "The distributed source map contains the bundled source used to build the executable.",
    "",
    ...sections
  ].join("\n");
  await writeFile(join(repositoryRoot, "THIRD_PARTY_LICENSES.txt"), content, "utf8");
}
