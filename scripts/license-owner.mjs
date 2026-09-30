import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { issueEmailLicense, normalizeEmail } from "../server/licenses.mjs";
import { createLicenseMail } from "../server/license-mail.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = randomBytes(32).toString("hex");
const prefix = `/owner/${token}/`;
const port = Number(process.env.TYTER_OWNER_PORT || 4184);
const origin = `http://127.0.0.1:${port}`;
const mail = createLicenseMail();
const files = new Map([
  ["", ["license-owner.html", "text/html"]],
  ["style.css", ["license-owner.css", "text/css"]],
  ["owner.js", ["license-owner.js", "text/javascript"]],
]);
createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  const pathname = req.url?.split("?")[0];
  if (
    req.headers.host !== `127.0.0.1:${port}` ||
    !pathname?.startsWith(prefix)
  ) {
    res.writeHead(404).end();
    return;
  }
  const route = pathname.slice(prefix.length);
  try {
    if (req.method === "GET" && files.has(route)) {
      const [file, type] = files.get(route);
      res.setHeader("Content-Type", `${type}; charset=utf-8`);
      res.end(await readFile(path.join(root, "server", file)));
      return;
    }
    if (req.method !== "POST" || route !== "issue") {
      res.writeHead(404).end();
      return;
    }
    if (
      req.headers.origin !== origin ||
      req.headers["x-owner-token"] !== token ||
      req.headers["content-type"] !== "application/json"
    ) {
      res.writeHead(403).end();
      return;
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) throw new Error("Слишком большой запрос.");
    }
    const input = JSON.parse(body);
    const email = normalizeEmail(input.email);
    const key = await issueEmailLicense({
      root,
      email,
      days: Number(input.days),
    });
    const record = {
      id: randomUUID(),
      email,
      name: String(input.name || "").slice(0, 100),
      licenseKey: key,
      createdAt: new Date().toISOString(),
    };
    await mkdir(path.join(root, "build-secrets"), { recursive: true });
    await appendFile(
      process.env.TYTER_OWNER_RECORDS_PATH ||
        path.join(root, "build-secrets", "issued-licenses.jsonl"),
      JSON.stringify(record) + "\n",
    );
    let emailSent = false,
      emailError = false;
    if (input.send === true) {
      try {
        await mail.send(record);
        emailSent = true;
      } catch {
        emailError = true;
      }
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ key, emailSent, emailError }));
  } catch (error) {
    res
      .writeHead(400, { "Content-Type": "application/json; charset=utf-8" })
      .end(JSON.stringify({ error: error.message }));
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Локальный генератор лицензий: ${origin}${prefix}`);
  console.log(
    "Откройте этот адрес на этом компьютере. Закройте генератор после работы.",
  );
});
