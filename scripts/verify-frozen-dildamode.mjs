import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function frozenFileHashes(directory, exclude = []) {
  const files = {};
  async function walk(relative = "") {
    for (const entry of await readdir(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (exclude.includes(name)) continue;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile())
        files[name] = createHash("sha256")
          .update(await readFile(path.join(directory, name)))
          .digest("hex");
      else throw new Error(`Unexpected link in frozen edition: ${name}`);
    }
  }
  await walk();
  return Object.fromEntries(
    Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
  );
}
export async function verifyFrozenDildaMode(project = root) {
  const manifest = JSON.parse(
    await readFile(path.join(project, "frozen/dildamode/FROZEN.json"), "utf8"),
  );
  let count = 0;
  for (const [directory, expected] of Object.entries(manifest.trees)) {
    if (!["frozen/dildamode", "public/dildamode"].includes(directory))
      throw new Error("Invalid frozen tree");
    const actual = await frozenFileHashes(path.join(project, directory), [
      "FROZEN.json",
    ]);
    const paths = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const name of paths) {
      if (actual[name] !== expected[name])
        throw new Error(
          `Dilda Mode is frozen; changed or missing file: ${directory}/${name}. Restore the original bytes; do not rebuild this edition.`,
        );
      count++;
    }
  }
  if (Object.keys(manifest.trees).length !== 2)
    throw new Error("Incomplete frozen edition manifest");
  return count;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(
    `Dilda Mode frozen integrity: ${await verifyFrozenDildaMode()} files verified.`,
  );
}
