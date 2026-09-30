import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import { localFilesPlugin } from "../local-files-plugin.js";
import { createProject } from "../src/data.js";

test("local files: durable Unicode, serial saves, reload, safe folder opening, origin checks", async (t) => {
  const parent = path.resolve("test-results/native");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "files-"));
  let handler,
    opened = 0;
  localFilesPlugin({
    directory,
    openFolder: async () => {
      opened++;
    },
  }).configureServer({
    middlewares: {
      use(fn) {
        handler = fn;
      },
    },
  });
  const server = http.createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, body, headers = {}) =>
    fetch(base + "/__tyter_local/" + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "X-Tyter-Local": "1",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const doc = createProject("Кириллица: берег");
  doc.id = "document-test";
  doc.comments = [
    {
      id: "note",
      text: "Пауза перед репликой.",
      author: "Вы",
      quote: "",
      createdAt: new Date().toISOString(),
      resolved: false,
    },
  ];
  let result = await request("documents", { documents: [doc] });
  assert.equal(result.status, 200);
  const files = await readdir(directory);
  assert.equal(files.length, 1);
  assert.match(files[0], /^document-[a-f0-9]{20}\.tyter\.json$/);
  const saved = JSON.parse(
    await readFile(path.join(directory, files[0]), "utf8"),
  );
  assert.equal(saved.title, doc.title);
  assert.equal(saved.comments[0].text, doc.comments[0].text);
  const newer = {
    ...doc,
    title: "Новая версия",
    updatedAt: "2090-01-01T00:00:00.000Z",
  };
  await request("documents", { documents: [newer] });
  await request("documents", { documents: [doc] });
  result = await request("documents");
  assert.equal((await result.json()).documents[0].title, "Новая версия");
  result = await request("open-folder", {});
  assert.equal(result.status, 200);
  assert.equal(opened, 1);
  result = await request(
    "open-folder",
    {},
    { Origin: "https://untrusted.example" },
  );
  assert.equal(result.status, 403);
  assert.equal(opened, 1);
  result = await request("documents", undefined, { "X-Tyter-Local": "" });
  assert.equal(result.status, 403);
  result = await request("documents", {
    documents: [{ id: "bad", title: "not a screenplay" }],
  });
  assert.equal(result.status, 500);
  assert.equal((await readdir(directory)).length, 1);
  result = await request("delete-document", { id: doc.id });
  assert.equal(result.status, 200);
  await request("documents", { documents: [newer] });
  const afterDelete = await (await request("documents")).json();
  assert.equal(afterDelete.documents.length, 0);
  assert.deepEqual(afterDelete.deletedIds, [doc.id]);
  assert.equal(JSON.parse(await readFile(path.join(directory, files[0] + ".deleted"), "utf8")).title, "Новая версия");
  result = await request("documents", {
    documents: [{ ...doc, id: "../../outside" }],
  });
  assert.equal(result.status, 400);
  assert.equal((await readdir(directory)).length, 1);
});

test("Vite refuses direct and /@fs downloads of local document files", async (t) => {
  const { createServer } = await import("vite");
  const parent = path.resolve("test-results/native");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "private-"));
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    cacheDir: path.join(directory, ".vite-test-cache"),
    plugins: [localFilesPlugin({ directory })],
    server: { host: "127.0.0.1", port: 0, hmr: false },
    logLevel: "silent",
  });
  await server.listen();
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const doc = createProject("Private test");
  const response = await fetch(base + "/__tyter_local/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Tyter-Local": "1" },
    body: JSON.stringify({ documents: [doc] }),
  });
  assert.equal(response.status, 200);
  const file = (await readdir(directory)).find((name) =>
    name.endsWith(".json"),
  );
  const absolute = path.join(directory, file).replaceAll("\\", "/");
  const relative = path.relative(process.cwd(), absolute).replaceAll("\\", "/");
  for (const url of [`/${relative}`, `/@fs/${absolute}`]) {
    const response = await fetch(base + url);
    assert.equal(response.status, 403);
    assert.equal((await response.text()).includes("Private test"), false);
  }
});
