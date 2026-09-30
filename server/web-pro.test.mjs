import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWebProHandler, parseProCodes } from "./web-pro.mjs";

test("only an assigned email and its matching code are accepted", () => {
  assert.equal(
    parseProCodes(
      "[ABC123][person@example.com]\n[AAAAAA][null]\n123456\n[BBBBBB][bad]",
    ).size,
    1,
  );
});
test("long sessions survive restart, renew, and are revoked when a pair is removed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tyter-auth-"));
  let time = Date.now();
  let server;
  try {
    await writeFile(
      path.join(root, "codes-for-pro.txt"),
      "[ABC123][person@example.com]\n[DEFGHI][other@example.com]\n[ZZZZZZ][null]",
    );
    const start = async () => {
      const handler = createWebProHandler({ root, env: {}, now: () => time });
      server = createServer((req, res) =>
        handler(req, res, () => res.writeHead(404).end()),
      );
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      return "http://127.0.0.1:" + server.address().port;
    };
    let base = await start();
    const login = (code, email) =>
      fetch(base + "/api/pro/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, email }),
      });
    assert.equal((await login("ABC123", "other@example.com")).status, 401);
    assert.equal((await login("ZZZZZZ", "person@example.com")).status, 401);
    const result = await (await login("abc123", " Person@Example.Com ")).json();
    assert.equal(result.authenticated, true);
    assert.ok(result.expiresAt > time + 365 * 86400000);
    const persisted = await readFile(
      path.join(root, ".web-pro-sessions.json"),
      "utf8",
    );
    assert.ok(
      !persisted.includes(result.token) &&
        !persisted.includes("ABC123") &&
        !persisted.includes("person@example.com"),
    );
    await new Promise((resolve) => server.close(resolve));
    time += 200 * 86400000;
    base = await start();
    const verify = () =>
      fetch(base + "/api/pro/session", {
        headers: { Authorization: "Bearer " + result.token },
      });
    const renewed = await (await verify()).json();
    assert.equal(renewed.authenticated, true);
    assert.ok(renewed.expiresAt > result.expiresAt);
    assert.equal((await fetch(base + "/codes-for-pro.txt?raw")).status, 404);
    assert.equal((await fetch(base + "/.web-pro-sessions.json")).status, 404);
    await writeFile(
      path.join(root, "codes-for-pro.txt"),
      "[DEFGHI][other@example.com]",
    );
    assert.equal((await verify()).status, 401);
  } finally {
    if (server?.listening)
      await new Promise((resolve) => server.close(resolve));
    assert.ok(
      path
        .resolve(root)
        .startsWith(path.resolve(os.tmpdir()) + path.sep + "tyter-auth-"),
    );
    await rm(root, { recursive: true, force: true });
  }
});
test("failed login is rate limited and cross origin requests are rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tyter-auth-"));
  const handler = createWebProHandler({ root, env: {} });
  const server = createServer((req, res) => handler(req, res));
  try {
    await writeFile(
      path.join(root, "codes-for-pro.txt"),
      "[ABC123][person@example.com]",
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url =
      "http://127.0.0.1:" + server.address().port + "/api/pro/session";
    assert.equal(
      (await fetch(url, { headers: { Origin: "https://untrusted.example" } }))
        .status,
      403,
    );
    for (let i = 0; i < 6; i++)
      assert.equal(
        (
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
        401,
      );
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      429,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    assert.ok(
      path
        .resolve(root)
        .startsWith(path.resolve(os.tmpdir()) + path.sep + "tyter-auth-"),
    );
    await rm(root, { recursive: true, force: true });
  }
});
