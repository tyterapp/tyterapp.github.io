import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { telegramDescriptor } from "../src/telegram.js";
import { paintTelegramCover } from "../src/telegram-cover.js";
import { readerJSON } from "../src/reader-export-data.js";

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const validId = (id) => /^[a-f\d]{32}$/.test(id || "");
export function telegramMetadata(html, telegram, url, cover) {
  const title = `${telegram.language === "en" ? "Telegram" : "Телеграмма"} — Tyter`;
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    () => `<title>${escape(title)}</title>`,
  );
  for (const [key, value] of Object.entries({
    description:
      telegram.title ||
      (telegram.language === "en" ? "Untitled" : "Без названия"),
    "og:title": title,
    "og:description":
      telegram.title ||
      (telegram.language === "en" ? "Untitled" : "Без названия"),
    "og:site_name": "Tyter",
    "og:url": url,
    "og:type": "article",
    "og:image": cover,
    "og:image:secure_url": cover,
    "og:image:type": "image/png",
    "og:image:width": "1200",
    "og:image:height": "630",
    "og:image:alt": telegram.text.slice(0, 300),
    "twitter:card": "summary_large_image",
    "twitter:image": cover,
    "twitter:title": title,
    "twitter:description": telegram.title || "Tyter",
  })) {
    const tag = `<meta ${key.startsWith("og:") ? "property" : "name"}="${key}" content="${escape(value)}" />`;
    const pattern = new RegExp(`<meta\\s+(?:property|name)="${key}"[^>]*>`);
    html = pattern.test(html)
      ? html.replace(pattern, () => tag)
      : html.replace("</head>", () => `${tag}</head>`);
  }
  html = html.replace(
    /<link rel="canonical"[^>]*>/,
    () => `<link rel="canonical" href="${escape(url)}" />`,
  );
  return html.replace(
    "</head>",
    () =>
      `<meta name="robots" content="noindex" /><script type="application/json" id="tyter-telegram">${readerJSON(telegram)}</script></head>`,
  );
}

// Immutable, public, content-addressed telegrams. No screenplay or project data
// is accepted; only the text/title the sender explicitly chose to share.
export function createTelegramHandler({
  site,
  store,
  origin,
  allowedOrigins = ["https://tyterapp.github.io"],
}) {
  const base = new URL(origin).origin,
    allowed = new Set([base, ...allowedOrigins]);
  const quota = new Map(),
    covers = new Map();
  const filename = (id) => path.join(store, `${id}.json`);
  const load = async (id) => {
    if (!validId(id)) return null;
    try {
      return telegramDescriptor(
        JSON.parse(await readFile(filename(id), "utf8")),
      );
    } catch {
      return null;
    }
  };
  return async function telegramHandler(req, res) {
    const address = new URL(req.url, base);
    const api = address.pathname.match(
      /^\/api\/telegrams(?:\/([a-f\d]{32})(\.png)?)?\/?$/,
    );
    const reader =
      address.pathname.replace(/\/$/, "") === "/telegram" &&
      address.searchParams.has("id");
    if (!api && !reader) return false;
    const reply = (
      status,
      body = "",
      type = "application/json; charset=utf-8",
    ) => {
      res.writeHead(status, {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    try {
      const requestOrigin = req.headers.origin;
      if (requestOrigin) {
        if (!allowed.has(requestOrigin)) {
          reply(403);
          return true;
        }
        res.setHeader("Access-Control-Allow-Origin", requestOrigin);
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, HEAD, POST, OPTIONS",
        );
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        reply(204);
        return true;
      }
      if (api && !api[1] && req.method === "POST") {
        const now = Date.now(),
          ip = req.socket.remoteAddress;
        const entry = quota.get(ip);
        if (entry && now - entry.start < 60000 && entry.count >= 20) {
          reply(429);
          return true;
        }
        quota.set(
          ip,
          entry && now - entry.start < 60000
            ? { ...entry, count: entry.count + 1 }
            : { start: now, count: 1 },
        );
        if (quota.size > 256) quota.delete(quota.keys().next().value);
        if (
          !/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")
        ) {
          reply(415);
          return true;
        }
        let bytes = 0;
        const chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 100000) {
            reply(413);
            return true;
          }
          chunks.push(chunk);
        }
        let telegram;
        try {
          telegram = telegramDescriptor(
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
          );
        } catch {
          /* Invalid JSON. */
        }
        if (!telegram) {
          reply(400);
          return true;
        }
        const json = JSON.stringify(telegram),
          id = createHash("sha256").update(json).digest("hex").slice(0, 32);
        await mkdir(store, { recursive: true });
        try {
          await writeFile(filename(id), json, { flag: "wx" });
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
        }
        reply(
          201,
          JSON.stringify({
            url: `${base}/telegram/?id=${id}`,
            coverURL: `${base}/api/telegrams/${id}.png`,
          }),
        );
        return true;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        reply(405);
        return true;
      }
      const id = reader ? address.searchParams.get("id") : api[1],
        telegram = await load(id);
      if (!telegram) {
        reply(404);
        return true;
      }
      const url = `${base}/telegram/?id=${id}`,
        coverURL = `${base}/api/telegrams/${id}.png`;
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      if (reader) {
        const html = await readFile(
          path.join(site, "telegram", "index.html"),
          "utf8",
        );
        reply(
          200,
          telegramMetadata(html, telegram, url, coverURL),
          "text/html; charset=utf-8",
        );
      } else if (api[2]) {
        if (!covers.has(id)) {
          GlobalFonts.registerFromPath(
            path.join(site, "fonts", "Cousine-Regular.ttf"),
            "Telegram Courier",
          );
          const logo = await loadImage(
            path.join(site, "brand", "tyter-logo.svg"),
          );
          const canvas = createCanvas(1200, 630);
          paintTelegramCover(canvas, telegram, url, logo);
          covers.set(id, await canvas.encode("png"));
          if (covers.size > 24) covers.delete(covers.keys().next().value);
        }
        reply(200, covers.get(id), "image/png");
      } else reply(200, JSON.stringify(telegram));
    } catch {
      reply(500);
    }
    return true;
  };
}
