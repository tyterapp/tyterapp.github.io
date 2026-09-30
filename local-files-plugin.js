import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  rename,
  access,
  stat,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { validateImport } from "./src/data.js";

// A same-origin, loopback-only bridge. No request may supply a filesystem path
// or an executable. The static build still works with browser storage alone.
export function localFilesPlugin(options = {}) {
  const directory = path.resolve(options.directory || "local-documents");
  let queue = Promise.resolve();
  const fileFor = (id) =>
    path.join(
      directory,
      `document-${createHash("sha256").update(id).digest("hex").slice(0, 20)}.tyter.json`,
    );
  const openFolder =
    options.openFolder ||
    (() =>
      new Promise((resolve, reject) => {
        const command =
          process.platform === "win32"
            ? "explorer.exe"
            : process.platform === "darwin"
              ? "open"
              : "xdg-open";
        const child = spawn(command, [directory], {
          shell: false,
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.once("error", reject);
        child.once("spawn", () => {
          child.unref();
          resolve();
        });
      }));
  const handler = async (req, res, next) => {
    const downloadName = req.url?.split("?")[0]?.slice("/downloads/".length);
    if (["Tyter-Free-Setup-1.0.0.exe", "Tyter-Pro-Setup-1.0.0.exe"].includes(downloadName) && req.url.startsWith("/downloads/")) {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.statusCode = 405;
        res.end();
        return;
      }
      const installer = path.resolve(`release/${downloadName.includes("-Pro-") ? "pro" : "free"}/${downloadName}`);
      try {
        const file = await stat(installer);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
        res.setHeader("Content-Length", file.size);
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "HEAD") res.end();
        else createReadStream(installer).pipe(res);
      } catch {
        res.statusCode = 404;
        res.end("Installer not found");
      }
      return;
    }
    if (!req.url.startsWith("/__tyter_local/")) return next();
    const send = (status, data) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(data));
    };
    const host = req.headers.host || "",
      hostname = host.split(":")[0];
    const remote = req.socket.remoteAddress || "";
    if (
      !["localhost", "127.0.0.1"].includes(hostname) ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote) ||
      req.headers["x-tyter-local"] !== "1" ||
      (req.headers.origin && req.headers.origin !== `http://${host}`)
    )
      return send(403, { error: "Только локальный доступ." });
    try {
      if (req.method === "GET" && req.url === "/__tyter_local/documents") {
        await queue;
        await mkdir(directory, { recursive: true });
        const names = await readdir(directory);
        const files = names.filter((name) =>
          /^document-[a-f0-9]{20}\.tyter\.json$/.test(name),
        );
        const documents = await Promise.all(
          files.map(async (name) =>
            validateImport(
              JSON.parse(await readFile(path.join(directory, name), "utf8")),
            ),
          ),
        );
        const deletedIds = await Promise.all(
          names
            .filter((name) =>
              /^document-[a-f0-9]{20}\.tyter\.json\.deleted$/.test(name),
            )
            .map(
              async (name) =>
                JSON.parse(await readFile(path.join(directory, name), "utf8"))
                  .id,
            ),
        );
        return send(200, { directory, documents, deletedIds });
      }
      if (
        req.method !== "POST" ||
        !req.headers["content-type"]?.startsWith("application/json")
      )
        return send(405, { error: "Неподдерживаемый запрос." });
      if (req.url === "/__tyter_local/open-folder") {
        await queue;
        await mkdir(directory, { recursive: true });
        await openFolder();
        return send(200, { directory });
      }
      if (
        ![
          "/__tyter_local/documents",
          "/__tyter_local/delete-document",
        ].includes(req.url)
      )
        return send(404, { error: "Не найдено." });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 25 * 1024 * 1024)
          return send(413, { error: "Слишком большой документ." });
        chunks.push(chunk);
      }
      // Decode once, including Cyrillic split across incoming buffers.
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (req.url === "/__tyter_local/delete-document") {
        if (typeof input.id !== "string" || !/^[\w-]{1,100}$/.test(input.id))
          return send(400, { error: "Некорректный идентификатор." });
        const deletion = queue
          .catch(() => {})
          .then(async () => {
            const target = fileFor(input.id);
            try {
              await rename(target, target + ".deleted");
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            }
          });
        queue = deletion.catch(() => {});
        await deletion;
        return send(200, { deleted: input.id });
      }
      if (!Array.isArray(input.documents) || input.documents.length > 1000)
        return send(400, { error: "Некорректные документы." });
      if (
        input.documents.some(
          (doc) =>
            typeof doc?.id !== "string" || !/^[\w-]{1,100}$/.test(doc.id),
        )
      )
        return send(400, { error: "Некорректный идентификатор документа." });
      const documents = input.documents.map(validateImport);
      const save = queue
        .catch(() => {})
        .then(async () => {
          await mkdir(directory, { recursive: true });
          for (const doc of documents) {
            try {
              await access(fileFor(doc.id) + ".deleted");
              continue;
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            }
            const hash = createHash("sha256")
              .update(doc.id)
              .digest("hex")
              .slice(0, 20);
            const target = path.join(directory, `document-${hash}.tyter.json`),
              temp = target + ".tmp";
            try {
              const existing = validateImport(
                JSON.parse(await readFile(target, "utf8")),
              );
              if (existing.updatedAt > doc.updatedAt) continue;
            } catch (error) {
              if (error.code !== "ENOENT") throw error;
            }
            await writeFile(temp, JSON.stringify(doc, null, 2), "utf8");
            await rename(temp, target);
          }
        });
      queue = save.catch(() => {});
      await save;
      send(200, { directory });
    } catch (error) {
      send(500, {
        error: "Не удалось прочитать или сохранить локальные файлы.",
      });
    }
  };
  return {
    name: "tyter-local-files",
    config(config) {
      // Local documents are never static assets, including Vite's /@fs route.
      return {
        server: {
          fs: {
            deny: [
              ...(config.server?.fs?.deny || [
                ".env",
                ".env.*",
                "*.{crt,pem}",
                "**/.git/**",
              ]),
              `${directory.replaceAll("\\", "/")}/**`,
              "**/payment-data/**",
              "**/build-secrets/**",
            ],
          },
        },
      };
    },
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
