import { cp, mkdir } from "node:fs/promises";

const files = [
  "index.html",
  "styles.css",
  "app.js",
  "sw.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png"
];

await mkdir("dist-web", { recursive: true });
await Promise.all(files.map(file => cp(`web/${file}`, `dist-web/${file}`)));
