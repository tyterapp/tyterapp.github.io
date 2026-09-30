import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { parseProEntries, PRO_CODES_URL } from "../src/pro-access.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "github-pages");
let codes = process.env.TYTER_PRO_CODES;
if (!codes?.trim()) {
  try {
    codes = await readFile(path.join(root, "codes-for-pro.txt"), "utf8");
  } catch {
    throw new Error(
      "Добавьте содержимое codes-for-pro.txt в GitHub Actions Secret TYTER_PRO_CODES. Для локальной сборки положите файл в корень проекта.",
    );
  }
}
const lines = codes.replace(/^\uFEFF/, "").split(/\r?\n/);
for (let index = 0; index < lines.length; index++) {
  const line = lines[index].trim();
  if (!line || line.startsWith("#")) continue;
  if (!/^\[([A-Za-z0-9]{6})\]\[([^\]]*)\]$/.test(line))
    throw new Error(
      `Строка ${index + 1} файла ключей: используйте формат [ABC123][email].`,
    );
}
const entries = parseProEntries(codes);
if (entries.length > 10000 || codes.length > 1024 * 1024)
  throw new Error("Файл ключей превышает допустимый размер.");
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
// The owner chose a publicly downloadable text file for this static MVP.
await writeFile(path.join(output, "codes-for-pro.txt"), codes, "utf8");
console.log("GitHub Pages готов: " + output);
console.log("Проверка PRO: " + PRO_CODES_URL);
if (!entries.some((entry) => entry.email))
  console.warn(
    "В файле нет ключей с назначенным email: PRO останется закрытым до обновления списка.",
  );
