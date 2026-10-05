import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { createProAccessList, PRO_CODES_URL } from "../src/pro-access.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "github-pages");
let codes = process.env.TYTER_PRO_CODES;
if (!codes?.trim()) {
  if (process.env.GITHUB_ACTIONS === "true")
    throw new Error(
      "Секрет TYTER_PRO_CODES отсутствует или пуст. Добавьте список в Settings → Secrets and variables → Actions.",
    );
  try {
    codes = await readFile(path.join(root, "codes-for-pro.txt"), "utf8");
  } catch {
    throw new Error(
      "Для локальной сборки положите codes-for-pro.txt в корень проекта. На GitHub используется секрет TYTER_PRO_CODES.",
    );
  }
}
// Never publish the raw secret: the browser needs only one-way pair proofs.
const accessList = await createProAccessList(codes);
await build({ root, mode: "production", base: "/", build: { outDir: output } });
for (const page of ["app", "free", "pay", "pro", "404"]) {
  await mkdir(path.join(output, page), { recursive: true });
  await copyFile(
    path.join(output, "index.html"),
    path.join(output, page, "index.html"),
  );
}
await copyFile(path.join(output, "index.html"), path.join(output, "404.html"));
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(path.join(output, "codes-for-pro.txt"), accessList, "utf8");
console.log("GitHub Pages готов: " + output);
console.log("Проверка PRO: " + PRO_CODES_URL);
if (!JSON.parse(accessList).pairs.length)
  console.warn(
    "Нет ключей с назначенным email: обновите TYTER_PRO_CODES и повторите публикацию.",
  );
