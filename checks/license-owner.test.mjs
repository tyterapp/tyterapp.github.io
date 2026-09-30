import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const { verifyLicense } = createRequire(import.meta.url)(
  "../desktop/license.cjs",
);

test("local owner generator rejects public requests and issues unique email-bound licenses", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "tyter-owner-"));
  const child = spawn(process.execPath, ["scripts/license-owner.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TYTER_OWNER_PORT: "4196",
      TYTER_OWNER_RECORDS_PATH: path.join(temp, "licenses.jsonl"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Owner server did not start")),
        10000,
      );
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Owner server exited"));
      });
      child.stdout.on("data", (chunk) => {
        const match = chunk
          .toString()
          .match(/http:\/\/127\.0\.0\.1:4196\/owner\/([a-f\d]+)\//);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
    });
    const origin = new URL(url).origin;
    const token = new URL(url).pathname.split("/")[2];
    assert.equal((await fetch(origin)).status, 404);
    const page = await fetch(url);
    assert.match(page.headers.get("x-robots-tag"), /noindex/);
    assert.match(await page.text(), /Лицензии Tyter Pro/);
    const issue = (requestOrigin, requestToken) =>
      fetch(url + "issue", {
        method: "POST",
        headers: {
          Origin: requestOrigin,
          "Content-Type": "application/json",
          "X-Owner-Token": requestToken,
        },
        body: JSON.stringify({
          email: "Owner-Test@Example.com",
          days: 365,
          send: false,
        }),
      });
    assert.equal((await issue("https://attacker.example", token)).status, 403);
    assert.equal((await issue(origin, "wrong")).status, 403);
    const first = await (await issue(origin, token)).json();
    const second = await (await issue(origin, token)).json();
    assert.notEqual(first.key, second.key);
    const publicKey = await readFile("desktop/license-public.pem", "utf8");
    const verified = verifyLicense(first.key, publicKey);
    assert.equal(verified.valid, true);
    assert.equal(
      verified.payload.emailHash,
      createHash("sha256").update("owner-test@example.com").digest("hex"),
    );
    assert.equal(first.emailSent, false);
    assert.equal(
      (await readFile(path.join(temp, "licenses.jsonl"), "utf8"))
        .trim()
        .split("\n").length,
      2,
    );
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    await rm(temp, { recursive: true, force: true });
  }
});
