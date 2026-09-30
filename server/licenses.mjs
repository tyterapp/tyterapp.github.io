import { createHash, createPublicKey, randomUUID, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const normalizeEmail = (value) => {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Укажите действующий email.");
  return email;
};
export async function licenseSigningKey(root, env = process.env) {
  const privatePath = path.resolve(
    root,
    env.TYTER_LICENSE_PRIVATE_KEY_PATH || "build-secrets/license-private.pem",
  );
  const [privateKey, publicKey] = await Promise.all([
    readFile(privatePath, "utf8"),
    readFile(path.join(root, "desktop/license-public.pem"), "utf8"),
  ]);
  const derived = createPublicKey(privateKey).export({
    type: "spki",
    format: "pem",
  });
  if (derived.trim() !== publicKey.trim())
    throw new Error("Ключ подписи лицензий не совпадает с ключом приложения.");
  return privateKey;
}
export async function issueEmailLicense({
  root,
  env = process.env,
  email,
  days = 365,
}) {
  email = normalizeEmail(email);
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("Срок лицензии: от 1 до 365 дней.");
  const issuedAt = Date.now();
  const payload = {
    product: "tyter-pro",
    version: 1,
    licenseId: randomUUID(),
    emailHash: createHash("sha256").update(email).digest("hex"),
    issuedAt,
    expiresAt: issuedAt + days * 86400000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(
    "sha256",
    Buffer.from(encoded),
    await licenseSigningKey(root, env),
  ).toString("base64url");
  return `TYTER1.${encoded}.${signature}`;
}
