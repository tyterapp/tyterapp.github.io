import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";

const hash = (value) => createHash("sha256").update(value).digest("hex");
// Practically permanent, renewable access; the owner can revoke the pair at any time.
const MAX_AGE = 100 * 365 * 24 * 60 * 60 * 1000;
const ATTEMPT_WINDOW = 5 * 60 * 1000;
export const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const pairHash = (code, email) =>
  hash(code.trim().toUpperCase() + "\n" + normalizeEmail(email));
export function parseProCodes(text) {
  const pairs = new Set();
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = line
      .trim()
      .match(/^\[([A-Za-z0-9]{6})\]\[([^\]\s]+@[^\]\s]+\.[^\]\s]+)\]$/);
    if (match) pairs.add(pairHash(match[1], match[2]));
  }
  return pairs;
}

export function createWebProHandler({
  root = process.cwd(),
  env = process.env,
  codesPath = path.resolve(
    root,
    env.TYTER_PRO_CODES_PATH || "codes-for-pro.txt",
  ),
  sessionsPath = path.resolve(
    root,
    env.TYTER_PRO_SESSIONS_PATH || ".web-pro-sessions.json",
  ),
  now = Date.now,
} = {}) {
  const sessions = new Map();
  const attempts = new Map();
  let loaded;
  let pending = Promise.resolve();
  const publicOrigin = env.TYTER_PUBLIC_URL
    ? new URL(env.TYTER_PUBLIC_URL).origin
    : null;
  const load = () =>
    (loaded ||= readFile(sessionsPath, "utf8")
      .then((text) => {
        for (const [token, session] of Object.entries(JSON.parse(text))) {
          if (
            /^[a-f0-9]{64}$/.test(token) &&
            /^[a-f0-9]{64}$/.test(session?.pairHash) &&
            session.expiresAt > now()
          )
            sessions.set(token, session);
        }
      })
      .catch((error) => {
        if (error.code !== "ENOENT") throw error;
      }));
  const persist = () => {
    const snapshot = JSON.stringify(Object.fromEntries(sessions));
    pending = pending
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(sessionsPath), { recursive: true });
        const temporary = sessionsPath + ".tmp";
        await writeFile(temporary, snapshot, { mode: 0o600 });
        await rename(temporary, sessionsPath);
      });
    return pending;
  };
  const send = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Robots-Tag": "noindex, nofollow",
    });
    res.end(JSON.stringify(data));
  };
  return async (req, res, next = () => {}) => {
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
    } catch {
      return send(res, 400, { error: "Некорректный адрес." });
    }
    if (
      [
        "codes-for-pro.txt",
        path.basename(codesPath),
        path.basename(sessionsPath),
      ].some((name) => pathname.toLowerCase().includes(name.toLowerCase()))
    )
      return send(res, 404, { error: "Не найдено." });
    if (!pathname.startsWith("/api/pro/")) return next();
    const origin = req.headers.origin;
    const sameHost =
      origin &&
      ["http:", "https:"].some(
        (protocol) => origin === protocol + "//" + req.headers.host,
      );
    if (origin && !(sameHost || origin === publicOrigin))
      return send(res, 403, { error: "Недопустимый источник." });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, DELETE, OPTIONS",
      );
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (pathname !== "/api/pro/session")
      return send(res, 404, { error: "Не найдено." });
    const token = req.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1];
    try {
      await load();
      const time = now();
      for (const [key, session] of sessions)
        if (session.expiresAt <= time) sessions.delete(key);
      for (const [address, entry] of attempts)
        if (entry.until <= time) attempts.delete(address);
      if (req.method === "DELETE") {
        if (token) {
          sessions.delete(hash(token));
          await persist();
        }
        return send(res, 200, { authenticated: false });
      }
      const pairs = parseProCodes(await readFile(codesPath, "utf8"));
      if (req.method === "GET") {
        const session = token && sessions.get(hash(token));
        if (!session || !pairs.has(session.pairHash)) {
          if (token) {
            sessions.delete(hash(token));
            await persist();
          }
          return send(res, 401, {
            authenticated: false,
            error: "Доступ к Pro не подтверждён. Проверьте email и ключ.",
          });
        }
        // Roll forward the long session; revocation is checked from the file on every request.
        if (time - session.renewedAt > 60 * 60 * 1000) {
          session.renewedAt = time;
          session.expiresAt = time + MAX_AGE;
          await persist();
        }
        return send(res, 200, {
          authenticated: true,
          expiresAt: session.expiresAt,
        });
      }
      if (req.method !== "POST")
        return send(res, 405, { error: "Метод не поддерживается." });
      const address = req.socket.remoteAddress || "unknown";
      const entry = attempts.get(address);
      if (entry?.count >= 6) {
        res.setHeader("Retry-After", Math.ceil((entry.until - time) / 1000));
        return send(res, 429, {
          error: "Слишком много попыток. Попробуйте через пять минут.",
        });
      }
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(res, 415, { error: "Ожидается JSON." });
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 1024)
          return send(res, 413, { error: "Слишком большой запрос." });
      }
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        return send(res, 400, { error: "Некорректный запрос." });
      }
      const code = typeof input?.code === "string" ? input.code.trim() : "";
      const email = normalizeEmail(input?.email);
      if (
        !/^[A-Za-z0-9]{6}$/.test(code) ||
        email.length > 254 ||
        !pairs.has(pairHash(code, email))
      ) {
        if (attempts.size >= 10000 && !entry)
          attempts.delete(attempts.keys().next().value);
        attempts.set(address, {
          count: (entry?.count || 0) + 1,
          until: entry?.until || time + ATTEMPT_WINDOW,
        });
        return send(res, 401, {
          authenticated: false,
          error:
            "Email или ключ не подошли. Проверьте оба поля или откройте бесплатную версию.",
        });
      }
      attempts.delete(address);
      const sessionToken = randomBytes(32).toString("base64url");
      if (sessions.size >= 10000) sessions.delete(sessions.keys().next().value);
      const expiresAt = time + MAX_AGE;
      const key = hash(sessionToken);
      sessions.set(key, {
        pairHash: pairHash(code, email),
        expiresAt,
        renewedAt: time,
      });
      try {
        await persist();
      } catch (error) {
        sessions.delete(key);
        throw error;
      }
      return send(res, 200, {
        authenticated: true,
        token: sessionToken,
        expiresAt,
      });
    } catch {
      return send(res, 503, {
        authenticated: false,
        error:
          "Не удалось проверить доступ. Проверьте интернет и повторите попытку.",
      });
    }
  };
}
