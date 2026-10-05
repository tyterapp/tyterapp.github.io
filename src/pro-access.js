export const PRO_CODES_URL = "https://tyterapp.github.io/codes-for-pro.txt";
export const PRO_SESSION_STORAGE = "tyter.webPro.session.v2";
const MAX_FILE_SIZE = 1024 * 1024;

const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const normalizeCode = (value) =>
  typeof value === "string" ? value.trim().toUpperCase() : "";
const validEmail = (email) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const validProSession = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function parseProEntries(text) {
  const entries = [];
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = line.trim().match(/^\[([A-Za-z0-9]{6})\]\[([^\]]*)\]$/);
    if (!match) continue;
    const email = normalizeEmail(match[2]);
    entries.push({
      code: normalizeCode(match[1]),
      email: validEmail(email) ? email : "",
    });
  }
  return entries;
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const proPairProof = (code, email) =>
  digest(
    `tyter-pro-access-v2\n${normalizeCode(code)}\n${normalizeEmail(email)}`,
  );
const proCodeProof = (code) =>
  digest(`tyter-pro-unassigned-v1\n${normalizeCode(code)}`);

// Only these one-way proofs are published; raw license codes and emails stay in
// the Actions secret (or the ignored local input file).
export async function createProAccessList(text) {
  if (typeof text !== "string" || !text.trim())
    throw new Error("Список ключей TYTER_PRO_CODES пуст.");
  if (text.length > MAX_FILE_SIZE)
    throw new Error("Список ключей превышает допустимый размер.");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;
    if (!/^\[([A-Za-z0-9]{6})\]\[([^\]]*)\]$/.test(line))
      throw new Error(
        `Строка ${index + 1} списка ключей: используйте формат [ABC123][email].`,
      );
  }
  const entries = parseProEntries(text);
  if (entries.length > 10000)
    throw new Error("Список ключей превышает допустимый размер.");
  const assigned = entries.filter((entry) => entry.email);
  const assignedCodes = new Set(assigned.map((entry) => entry.code));
  return JSON.stringify({
    version: 1,
    pairs: [
      ...new Set(
        await Promise.all(
          assigned.map((entry) => proPairProof(entry.code, entry.email)),
        ),
      ),
    ],
    unassigned: [
      ...new Set(
        await Promise.all(
          entries
            .filter((entry) => !entry.email && !assignedCodes.has(entry.code))
            .map((entry) => proCodeProof(entry.code)),
        ),
      ),
    ],
  });
}

export function parseProAccessList(text) {
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    throw new ProAccessUnavailable(
      "Не удалось прочитать файл проверки доступа. Опубликуйте сайт заново.",
    );
  }
  if (
    list?.version !== 1 ||
    !Array.isArray(list.pairs) ||
    !Array.isArray(list.unassigned) ||
    list.pairs.length + list.unassigned.length > 10000 ||
    !list.pairs.every(validProSession) ||
    !list.unassigned.every(validProSession)
  )
    throw new ProAccessUnavailable(
      "Не удалось прочитать файл проверки доступа. Опубликуйте сайт заново.",
    );
  return list;
}

export class ProAccessUnavailable extends Error {}

const denied = (error) => ({
  ok: false,
  status: 401,
  result: { authenticated: false, error },
});

export async function verifyProAccess({ method, body, token, signal }) {
  const url = new URL(PRO_CODES_URL);
  // Avoid a cached list when the owner changes or revokes access.
  url.searchParams.set("check", String(Date.now()));
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok)
    throw new ProAccessUnavailable(
      "Файл ключей недоступен. Повторите проверку позже или свяжитесь с автором.",
    );
  if (
    Number(response.headers.get("Content-Length")) > MAX_FILE_SIZE ||
    response.headers.get("Content-Type")?.includes("text/html")
  )
    throw new ProAccessUnavailable(
      "Не удалось прочитать файл ключей. Свяжитесь с автором.",
    );
  const text = await response.text();
  if (text.length > MAX_FILE_SIZE)
    throw new ProAccessUnavailable("Не удалось прочитать файл ключей.");
  const list = parseProAccessList(text);

  let candidate = token;
  if (method === "POST") {
    const code = normalizeCode(body?.code);
    const email = normalizeEmail(body?.email);
    if (!/^[A-Z0-9]{6}$/.test(code) || !validEmail(email))
      return denied("Укажите корректный email и ключ из шести букв или цифр.");
    if (list.unassigned.includes(await proCodeProof(code)))
      return denied(
        "Для этого ключа не указан email. Обратитесь к автору или откройте бесплатную версию.",
      );
    candidate = await proPairProof(code, email);
    if (!list.pairs.includes(candidate))
      return denied(
        "Email или ключ не подошли. Проверьте оба поля или откройте бесплатную версию.",
      );
  } else {
    if (!validProSession(candidate))
      return denied("Введите email и ключ, чтобы открыть Pro.");
    if (!list.pairs.includes(candidate))
      return denied(
        "Доступ к Pro не подтверждён. Проверьте email и ключ или откройте бесплатную версию.",
      );
  }
  return {
    ok: true,
    status: 200,
    result: {
      authenticated: true,
      ...(method === "POST" ? { token: candidate } : {}),
    },
  };
}
