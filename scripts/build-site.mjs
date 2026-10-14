import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { SITE_ROUTES } from "../src/site-content.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "site-dist");
await build({ root, mode: "production", build: { outDir: output } });
for (const page of [
  "app",
  "free",
  "pay",
  "pro",
  "beta",
  "404",
  ...SITE_ROUTES,
]) {
  await mkdir(path.join(output, page), { recursive: true });
  await copyFile(
    path.join(output, "index.html"),
    path.join(output, page, "index.html"),
  );
}
await copyFile(path.join(output, "index.html"), path.join(output, "404.html"));
console.log("Сайт готов: " + output);
