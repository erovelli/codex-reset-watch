import { chmod, mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("dist", { recursive: true });
await build({
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
  legalComments: "none"
});
await chmod("dist/cli.js", 0o755);
