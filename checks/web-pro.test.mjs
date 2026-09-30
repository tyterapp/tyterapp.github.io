import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWebProHandler } from "../server/web-pro.mjs";

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), "tyter-web-pro-"));
  const codesPath = path.join(root, "codes-for-pro.txt");
  await writeFile(codesPath, "135790\n246801\n031425\n987654\n");
  let time = Date.now();
  const handler = createWebProHandler({
    root,
    env: { TYTER_PUBLIC_URL: "https://tyter.example" },
    now: () => time,
  });
  const server = createServer((req, res) =>
    handler(req, res, () => res.writeHead(404).end()),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (code, origin) =>
    fetch(`${base}/api/pro/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify({ code }),
    });
  const verify = (token, method = "GET") =>
    fetch(`${base}/api/pro/session`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
  try {
    await run({
      base,
      login,
      verify,
      codesPath,
      advance: (ms) => {
        time += ms;
      },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
}

test("web Pro verifies exact codes on the server, revokes removed codes and expires sessions", async () => {
  await fixture(async ({ base, login, verify, codesPath, advance }) => {
    assert.equal((await fetch(`${base}/api/pro/session`)).status, 401);
    assert.equal((await login("13579")).status, 401);
    assert.equal((await login("1357900")).status, 401);
    assert.equal((await login("000000")).status, 401);
    assert.equal((await login("135790", "https://other.example")).status, 403);
    const tokens = [];
    for (const code of ["135790", "246801", "031425", "987654"]) {
      const response = await login(code, "https://tyter.example");
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("Access-Control-Allow-Origin"),
        "https://tyter.example",
      );
      const session = await response.json();
      assert.equal(session.authenticated, true);
      assert.match(session.token, /^[\w-]{43}$/);
      assert.ok(!JSON.stringify(session).includes(code));
      tokens.push(session.token);
    }
    assert.equal(new Set(tokens).size, 4);
    assert.equal((await verify("x".repeat(43))).status, 401);
    assert.equal((await verify(tokens[0])).status, 200);
    await writeFile(codesPath, "246801\n031425\n987654\n");
    assert.equal((await verify(tokens[0])).status, 401);
    assert.equal((await verify(tokens[1])).status, 200);
    await writeFile(codesPath, "135790\n246801\n031425\n987654\n");
    assert.equal(
      (await verify(tokens[0])).status,
      401,
      "restoring a code does not resurrect the revoked session",
    );
    assert.equal((await verify(tokens[1], "DELETE")).status, 200);
    assert.equal((await verify(tokens[1])).status, 401);
    advance(12 * 60 * 60 * 1000 + 1);
    assert.equal((await verify(tokens[2])).status, 401);
    for (const file of [
      "/codes-for-pro.txt",
      "/codes-for-pro.txt?raw",
      "/@fs/other/codes-for-pro.txt",
    ]) {
      const response = await fetch(base + file);
      assert.equal(response.status, 404);
      assert.ok(!(await response.text()).includes("135790"));
    }
  });
});

test("web Pro rate limits guesses and denies access when the server file is missing", async () => {
  await fixture(async ({ login, verify, codesPath, advance }) => {
    for (let i = 0; i < 6; i++)
      assert.equal((await login("000000")).status, 401);
    const limited = await login("135790");
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("Retry-After")) > 0);
    advance(5 * 60 * 1000 + 1);
    const session = await (await login("135790")).json();
    await rm(codesPath);
    assert.equal((await verify(session.token)).status, 503);
    assert.equal((await login("135790")).status, 503);
  });
});
