import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = [
  "# Preserve the bytes of the separately frozen edition across Git checkouts.",
  "/frozen/dildamode/** -text",
  "/public/dildamode/** -text",
].join("\n");

export async function ensureDeployAttributes(root = projectRoot) {
  const target = path.join(root, ".gitattributes");
  let existing = "";
  try { existing = await readFile(target, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!existing.trimEnd().endsWith(rules)) {
    const separator = existing && !existing.endsWith("\n") ? "\n" : "";
    await writeFile(target, `${existing}${separator}${rules}\n`, "utf8");
  }

  // Git caches file stat information. Changing attributes alone may leave an
  // old normalized blob in the index even after a later ordinary `git add .`.
  // Invalidate only affected stat entries, keeping the existing staged blobs;
  // the user's own `git add` can then stage the original working-tree bytes.
  if (!existsSync(path.join(root, ".git"))) return;
  const git = (args, options = {}) => execFileSync("git", args, { cwd: root, ...options });
  const scope = ["frozen/dildamode", "public/dildamode"];
  const eols = git(["ls-files", "--eol", "-z", "--", ...scope]).toString("utf8").split("\0");
  const affected = new Set(eols.filter(line => /^i\/lf\s+w\/crlf\s/.test(line)).map(line => line.slice(line.indexOf("\t") + 1)));
  if (!affected.size) return;
  const flags = git(["ls-files", "-v", "-z", "--", ...scope]).toString("utf8").split("\0");
  for (const line of flags) {
    if (line && affected.has(line.slice(2)) && line.slice(0, 2) !== "H ")
      throw new Error("Cannot refresh special Git index entries; resolve them before building.");
  }
  const stages = git(["ls-files", "--stage", "-z", "--", ...scope]).toString("utf8").split("\0");
  const entries = stages.filter(line => line && affected.has(line.slice(line.indexOf("\t") + 1)));
  if (entries.some(line => !/^\d+ [a-f0-9]+ 0\t/.test(line)))
    throw new Error("Cannot refresh unresolved Git index entries; resolve them before building.");
  git(["update-index", "-z", "--index-info"], { input: Buffer.from(entries.join("\0") + "\0") });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureDeployAttributes();
}
