import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "github-pages",
);
const port = Number(process.env.TYTER_PREVIEW_PORT || 4181);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  try {
    const url = new URL(request.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    let target = path.resolve(root, "." + pathname);
    if (target !== root && !target.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const details = await stat(target);
    if (details.isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        response.writeHead(301, { Location: url.pathname + "/" + url.search });
        response.end();
        return;
      }
      target = path.join(target, "index.html");
    }
    const body = await readFile(target);
    response.writeHead(200, {
      "Content-Type": types[path.extname(target)] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    try {
      const body = await readFile(path.join(root, "404.html"));
      response.writeHead(404, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": body.length,
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Статическая сборка: http://127.0.0.1:${port}/`);
});
