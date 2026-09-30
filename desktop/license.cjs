const { createPublicKey, verify } = require("node:crypto");

const PRODUCT = "tyter-pro";
const MAX_KEY_LENGTH = 8192;

function verifyLicense(key, publicKey, now = Date.now()) {
  if (typeof key !== "string" || key.length > MAX_KEY_LENGTH)
    return { valid: false, reason: "Некорректный ключ лицензии." };
  const parts = key.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "TYTER1")
    return { valid: false, reason: "Некорректный ключ лицензии." };
  try {
    const [, encoded, signature] = parts;
    if (!/^[A-Za-z0-9_-]+$/.test(encoded + signature))
      throw new Error("invalid encoding");
    const authentic = verify(
      "sha256",
      Buffer.from(encoded, "utf8"),
      publicKey?.type === "public" ? publicKey : createPublicKey(publicKey),
      Buffer.from(signature, "base64url"),
    );
    if (!authentic)
      return { valid: false, reason: "Подпись лицензии не совпадает." };
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    if (
      payload.product !== PRODUCT ||
      payload.version !== 1 ||
      (payload.emailHash !== undefined && !/^[a-f0-9]{64}$/.test(payload.emailHash)) ||
      typeof payload.licenseId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(payload.licenseId) ||
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.issuedAt > now + 5 * 60 * 1000 ||
      payload.expiresAt <= payload.issuedAt
    )
      return { valid: false, reason: "Некорректные данные лицензии." };
    if (payload.expiresAt <= now)
      return { valid: false, reason: "Срок лицензии истёк." };
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "Некорректный ключ лицензии." };
  }
}

module.exports = { verifyLicense };
