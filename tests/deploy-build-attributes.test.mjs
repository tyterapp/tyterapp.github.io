import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "vite";
import { offlineEditorPlugin } from "../scripts/offline-editor-plugin.mjs";

const helper = new URL("../scripts/ensure-deploy-attributes.mjs", import.meta.url);
async function temp() { return mkdtemp(path.join(os.tmpdir(), "tyter-deploy-test-")); }
async function clean(directory) {
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + "tyter-deploy-test-"));
  await rm(directory, { recursive: true, force: true });
}
function git(directory, ...args) { return execFileSync("git", args, { cwd: directory, stdio: ["ignore", "pipe", "pipe"] }); }

test("build setup preserves original snapshot bytes across Windows commit and Linux-style checkout", async () => {
  assert.ok(existsSync(helper), "deployment attributes helper must exist");
  const { ensureDeployAttributes } = await import(helper.href);
  const root = await temp();
  try {
    git(root, "init", "-q");
    git(root, "config", "user.email", "test@example.invalid");
    git(root, "config", "user.name", "Test");
    git(root, "config", "core.autocrlf", "true");
    const fixtures = ["frozen/dildamode/src/item.js", "public/dildamode/file.txt"];
    for (const file of fixtures) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), "one\r\ntwo\r\n");
    }
    await writeFile(path.join(root, ".gitattributes"), "*.png binary\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "baseline");
    await new Promise(resolve => setTimeout(resolve, 2100));
    git(root, "status", "--short");
    assert.equal(git(root, "show", "HEAD:" + fixtures[0]).toString(), "one\ntwo\n");
    const stagedBefore = git(root, "diff", "--cached", "--name-only").toString();
    await ensureDeployAttributes(root);
    assert.equal(git(root, "diff", "--cached", "--name-only").toString(), stagedBefore);
    const attrs = await readFile(path.join(root, ".gitattributes"), "utf8");
    await ensureDeployAttributes(root);
    assert.equal(await readFile(path.join(root, ".gitattributes"), "utf8"), attrs);
    assert.match(attrs, /\*\.png binary/);
    git(root, "add", ".");
    for (const file of fixtures) assert.equal(git(root, "show", ":" + file).toString(), "one\r\ntwo\r\n");
    git(root, "commit", "-qm", "preserve");
    const clone = path.join(root, "checkout");
    git(root, "-c", "core.autocrlf=false", "clone", "-q", "--no-local", root, clone);
    for (const file of fixtures) assert.equal(await readFile(path.join(clone, file), "utf8"), "one\r\ntwo\r\n");
  } finally { await clean(root); }
});

test("offline cache does not hide the original build error when no output was written", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "index.html"), "<html><body>fixture</body></html>");
    await assert.rejects(build({ configFile: false, root, logLevel: "silent", plugins: [offlineEditorPlugin(), { name: "synthetic-error", buildStart() { throw new Error("SYNTHETIC_BUILD_ERROR"); } }] }), /SYNTHETIC_BUILD_ERROR/);
    assert.equal(existsSync(path.join(root, "dist/editor-sw.js")), false);
  } finally { await clean(root); }
});
