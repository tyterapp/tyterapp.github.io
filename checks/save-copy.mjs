import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { saveTytCopy } = createRequire(import.meta.url)(
  "../desktop/save-copy.cjs",
);
const directory = await mkdtemp(path.join(os.tmpdir(), "tyter-copy-check-"));
const target = path.join(directory, "Мой файл.tyt");
const copy = {
  name: "Мой файл.tyt",
  text: JSON.stringify({
    format: "tyter",
    version: 1,
    document: { id: "check" },
  }),
};
let shown = 0;
const dialog = {
  async showSaveDialog(parent, options) {
    shown++;
    assert.equal(parent, "test-window");
    assert.equal(options.defaultPath, copy.name);
    assert.deepEqual(options.filters[0].extensions, ["tyt"]);
    return { canceled: false, filePath: target };
  },
};
try {
  assert.deepEqual(await saveTytCopy(dialog, "test-window", copy), {
    name: copy.name,
  });
  assert.equal(await readFile(target, "utf8"), copy.text);
  const updated = {
    ...copy,
    text: JSON.stringify({
      format: "tyter",
      version: 1,
      document: { id: "latest" },
    }),
  };
  await saveTytCopy(dialog, "test-window", updated);
  assert.equal(await readFile(target, "utf8"), updated.text);
  assert.deepEqual(await readdir(directory), [copy.name]);
  assert.deepEqual(
    await saveTytCopy(
      { showSaveDialog: async () => ({ canceled: true }) },
      null,
      copy,
    ),
    { canceled: true },
  );
  assert.equal(await readFile(target, "utf8"), updated.text);
  for (const invalid of [
    { ...copy, name: "../bad.tyt" },
    { ...copy, text: "{}" },
    { ...copy, name: "bad.pdf" },
  ])
    await assert.rejects(saveTytCopy(dialog, "test-window", invalid));
  assert.equal(shown, 2);
  console.log(
    "Desktop TYT copy: save, overwrite, cancel and validation passed.",
  );
} finally {
  // Delete only the single file created by this check; remove the now-empty folder.
  await rm(target, { force: true });
  await rmdir(directory);
}
