import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {};
const directories = [
  ".github",
  "src",
  "public",
  "scripts",
  "server",
  "desktop",
  "build-resources",
  "docs",
  "tests",
  "checks",
];
const rootFiles = [
  "package.json",
  "package-lock.json",
  "index.html",
  "vite.config.js",
  "local-files-plugin.js",
  "web-pro-plugin.js",
  "payment-plugin.js",
  "playwright.config.js",
  "playwright.pages.config.js",
  ".gitignore",
  ".env.example",
  "README.md",
];
const forbidden =
  /(^|\/)(codes-for-pro\.txt|\.env(?!\.example$)|\.web-pro-sessions[^/]*|[^/]*private[^/]*\.(pem|key))$|\.log$/i;
async function add(relative) {
  if (forbidden.test(relative)) return;
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep))
    throw new Error("Путь вне проекта.");
  files[relative.replaceAll("\\", "/")] = new Uint8Array(
    await readFile(absolute),
  );
}
async function walk(relative) {
  for (const entry of await readdir(path.join(root, relative), {
    withFileTypes: true,
  })) {
    const next = relative + "/" + entry.name;
    if (entry.isDirectory()) await walk(next);
    else if (entry.isFile()) await add(next);
  }
}
for (const directory of directories) await walk(directory);
for (const file of rootFiles) await add(file);
await mkdir(path.join(root, "publication"), { recursive: true });
const target = path.join(root, "publication", "tyter-github-pages-source.zip");
await writeFile(target, zipSync(files, { level: 6 }));
console.log(
  "Архив исходников: " + target + ". Файлов: " + Object.keys(files).length,
);
