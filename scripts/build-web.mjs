import { cp, mkdir } from "node:fs/promises";

const files = [
  "index.html",
  "styles.css",
  "theme.js",
  "app.js",
  "sw.js",
  "manifest.webmanifest",
  "icon-smiley.svg",
  "icon-smiley-dark.svg",
  "icon-smiley-dark-192.png",
  "apple-touch-icon-smiley.png",
  "icon-smiley-192.png",
  "icon-smiley-512.png"
];

await mkdir("dist-web", { recursive: true });
await Promise.all(files.map(file => cp(`web/${file}`, `dist-web/${file}`)));
