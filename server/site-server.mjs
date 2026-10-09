import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWebProHandler } from "./web-pro.mjs";
const site = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "site-dist",
);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".exe": "application/octet-stream",
  ".dmg": "application/octet-stream",
};
const checkPro = createWebProHandler();
createServer(async (req, res) => {
  await checkPro(req, res, async () => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405).end();
        return;
      }
      const pathname =
        decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        ).replace(/\/+$/, "") || "/";
      if (["/free", "/pay"].includes(pathname)) {
        res
          .writeHead(301, {
            Location: pathname === "/pay" ? "/beta" : "/app",
          })
          .end();
        return;
      }
      const relative =
        pathname === "/"
          ? "index.html"
          : ["/app", "/pro", "/beta"].includes(pathname)
            ? pathname.slice(1) + "/index.html"
            : pathname.slice(1);
      const target = path.resolve(site, relative);
      if (!target.startsWith(site + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const info = await stat(target);
      if (!info.isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader(
        "Content-Type",
        mime[path.extname(target)] || "application/octet-stream",
      );
      res.setHeader("Content-Length", info.size);
      if (/\.(exe|dmg)$/.test(target))
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${path.basename(target)}"`,
        );
      if (target.endsWith("codes-for-pro.txt"))
        res.setHeader("Cache-Control", "no-store");
      if (req.method === "HEAD") res.end();
      else createReadStream(target).pipe(res);
    } catch {
      res.writeHead(404).end();
    }
  });
}).listen(
  Number(process.env.PORT || 4173),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log("Tyter site: http://127.0.0.1:" + (process.env.PORT || 4173)),
);
