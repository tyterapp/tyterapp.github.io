import { generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { issueEmailLicense } from "../server/licenses.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secretFile = path.join(root, "build-secrets", "license-private.pem");
const publicFile = path.join(root, "desktop", "license-public.pem");
const command = process.argv[2];

if (command === "init") {
  try {
    await readFile(secretFile);
    throw new Error("Закрытый ключ уже существует. Он не будет перезаписан.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  await mkdir(path.dirname(secretFile), { recursive: true });
  await writeFile(secretFile, privateKey, { encoding: "utf8", flag: "wx" });
  await writeFile(publicFile, publicKey, { encoding: "utf8", flag: "wx" });
  console.log("Ключи созданы. Закрытый ключ храните отдельно от установщиков:");
  console.log(secretFile);
} else if (command === "issue") {
  const arg = (name) => {
    const index = process.argv.indexOf(`--${name}`);
    return index < 0 ? undefined : process.argv[index + 1];
  };
  const days = Number(arg("days") ?? 365);
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("Укажите срок от 1 до 365 дней.");
  const key = await issueEmailLicense({ root, email: arg("email"), days });
  const output = arg("out");
  if (output) {
    const target = path.resolve(output);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, key, { encoding: "utf8", flag: "wx" });
    console.log(`Лицензия сохранена: ${target}`);
  } else {
    console.log(key);
  }
} else {
  console.log(
    "Использование: npm run license:init | npm run license:issue -- --email user@example.com --days 365 --out путь-к-файлу",
  );
  process.exitCode = 1;
}
