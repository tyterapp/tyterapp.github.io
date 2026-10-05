import test from "node:test";
import assert from "node:assert/strict";
import {
  createProAccessList,
  parseProAccessList,
  proPairProof,
  verifyProAccess,
  ProAccessUnavailable,
} from "../src/pro-access.js";

const privateList =
  "\uFEFF[abc123][Person@Example.Test]\r\n[ABC123][]\r\n[EMPTY1][]\r\n[BAD001][not-an-email]\r\n[abc123][person@example.test]\r\n";

test("published access data contains only proofs, deduplicates pairs and preserves case-insensitive sessions", async () => {
  const published = await createProAccessList(privateList);
  const list = parseProAccessList(published);
  assert.equal(list.version, 1);
  assert.deepEqual(list.pairs, [
    await proPairProof("ABC123", "person@example.test"),
  ]);
  assert.equal(list.unassigned.length, 2);
  assert.doesNotMatch(
    published,
    /@|ABC123|abc123|EMPTY1|BAD001|Person|not-an-email/,
  );
});

test("invalid source data stops publication without echoing private input", async () => {
  await assert.rejects(createProAccessList("  "), /пуст/);
  await assert.rejects(
    createProAccessList("[SECRET][private@example.test"),
    (error) => {
      assert.match(error.message, /Строка 1/);
      assert.doesNotMatch(error.message, /SECRET|private@example/);
      return true;
    },
  );
});

test("an old raw list, corrupt JSON and unsupported manifests cannot grant access", () => {
  for (const text of [
    privateList,
    "null",
    "[]",
    "{}",
    JSON.stringify({ version: 2, pairs: [], unassigned: [] }),
    JSON.stringify({ version: 1, pairs: ["not-a-proof"], unassigned: [] }),
  ])
    assert.throws(() => parseProAccessList(text), ProAccessUnavailable);
});

test("a duplicate unassigned row does not block an assigned key and unassigned keys still explain the missing email", async () => {
  const previousFetch = globalThis.fetch;
  const published = await createProAccessList(privateList);
  globalThis.fetch = async () =>
    new Response(published, { headers: { "Content-Type": "text/plain" } });
  try {
    const granted = await verifyProAccess({
      method: "POST",
      body: { code: "ABC123", email: "PERSON@EXAMPLE.TEST" },
    });
    assert.equal(granted.ok, true);
    const missing = await verifyProAccess({
      method: "POST",
      body: { code: "EMPTY1", email: "person@example.test" },
    });
    assert.equal(missing.ok, false);
    assert.match(missing.result.error, /не указан email/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
