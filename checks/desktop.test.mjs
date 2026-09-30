import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createProject } from "../src/data.js";

const require = createRequire(import.meta.url);
const { verifyLicense } = require("../desktop/license.cjs");
const { createLocalStore } = require("../desktop/local-store.cjs");

test("paid license requires an authentic, unexpired signature", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const now = Date.now();
  const encoded = Buffer.from(
    JSON.stringify({
      product: "tyter-pro",
      version: 1,
      licenseId: randomUUID(),
      issuedAt: now,
      expiresAt: now + 365 * 24 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  const signature = sign("sha256", Buffer.from(encoded), privateKey).toString(
    "base64url",
  );
  const key = `TYTER1.${encoded}.${signature}`;
  assert.equal(verifyLicense(key, publicKey, now).valid, true);
  assert.equal(
    verifyLicense(key, publicKey, now + 366 * 24 * 60 * 60 * 1000).valid,
    false,
  );
  assert.equal(verifyLicense(key + "x", publicKey, now).valid, false);
  assert.equal(verifyLicense("invalid", publicKey, now).valid, false);
});

test("desktop editions read the same document files and honor tombstones", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tyter-desktop-"));
  try {
    const free = createLocalStore(directory, async () => "");
    const pro = createLocalStore(directory, async () => "");
    const document = createProject("Общий сценарий");
    await free("documents", { documents: [document] });
    const loaded = await pro("documents");
    assert.equal(loaded.documents[0].title, "Общий сценарий");
    await pro("delete-document", { id: document.id });
    const deleted = await free("documents");
    assert.deepEqual(deleted.documents, []);
    assert.deepEqual(deleted.deletedIds, [document.id]);
    await free("documents", { documents: [document] });
    assert.equal(
      (await readdir(directory)).filter((name) => name.endsWith(".deleted"))
        .length,
      1,
    );
    assert.equal((await free("documents")).documents.length, 0);
    await assert.rejects(() => pro("delete-document", { id: "../outside" }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
