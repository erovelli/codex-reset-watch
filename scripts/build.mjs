import { chmod, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { writeThirdPartyLicenses } from "./third-party-licenses.mjs";

await mkdir("dist", { recursive: true });
const result = await build({
  entryPoints: ["src/cli/main.ts"],
  outfile: "dist/cli.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from \"node:module\";\nconst require = createRequire(import.meta.url);"
  },
  sourcemap: true,
  legalComments: "none",
  metafile: true
});
await writeThirdPartyLicenses(result.metafile);
await chmod("dist/cli.js", 0o755);
