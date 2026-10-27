import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frozenFileHashes } from "./verify-frozen-dildamode.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "frozen/dildamode/FROZEN.json");
try {
  await access(target);
  throw new Error("Already frozen. Do not regenerate the manifest.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const trees = {};
for (const directory of ["frozen/dildamode", "public/dildamode"])
  trees[directory] = await frozenFileHashes(path.join(root, directory));
await writeFile(
  target,
  JSON.stringify(
    { edition: "Dilda Mode", date: "2026-10-27", immutable: true, trees },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  "Dilda Mode frozen. Further builds must only copy the existing public/dildamode bytes.",
);
