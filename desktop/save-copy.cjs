const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { writeFile, rename, rm } = require("node:fs/promises");

async function saveTytCopy(dialog, parent, copy) {
  if (
    typeof copy?.name !== "string" ||
    !/.+\.tyt$/i.test(copy.name) ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(copy.name) ||
    copy.name.length > 255 ||
    typeof copy.text !== "string" ||
    copy.text.length > 256 * 1024 * 1024
  )
    throw new Error("Некорректная копия TYT.");
  const payload = JSON.parse(copy.text);
  if (payload?.format !== "tyter" || payload.version !== 1 || !payload.document)
    throw new Error("Некорректная копия TYT.");
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: "Tyter · TYT",
    defaultPath: copy.name,
    filters: [{ name: "Tyter", extensions: ["tyt"] }],
    properties: ["showOverwriteConfirmation", "createDirectory"],
  });
  if (canceled || !filePath) return { canceled: true };
  const target = /\.tyt$/i.test(filePath) ? filePath : `${filePath}.tyt`;
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, copy.text, { encoding: "utf8", flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  return { name: path.basename(target) };
}

module.exports = { saveTytCopy };
