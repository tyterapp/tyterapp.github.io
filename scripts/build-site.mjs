import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { SITE_ROUTES } from "../src/site-content.js";
import { pageMetadata, writeSiteSeo } from "./site-seo.mjs";
import { writeHouseSocialPages } from "./house-social-pages.mjs";
import { writeTelegramSocialPage } from "./telegram-social-page.mjs";
import { writeTelegraphSocialPage } from "./telegraph-social-page.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "site-dist");
await build({ root, mode: "production", build: { outDir: output } });
await writeSiteSeo(output);
const html = await readFile(path.join(output, "index.html"), "utf8");
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
  await writeFile(
    path.join(output, page, "index.html"),
    pageMetadata(html, page),
  );
}
await writeFile(path.join(output, "404.html"), pageMetadata(html, "404"));
await writeHouseSocialPages(output);
await writeTelegramSocialPage(output);
await writeTelegraphSocialPage(output);
console.log("Сайт готов: " + output);
