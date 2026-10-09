import { validateImport } from "./data.js";
import { listRevisions, revisionArea, snapshotOf } from "./history.js";
import { scriptVersionId } from "./script-versions.js";

export const tytPayload = (document, history = []) => ({
  format: "tyter",
  version: 1,
  exportedAt: new Date().toISOString(),
  document,
  history,
});
export async function exportTYT(document) {
  const history = await listRevisions(document.id, Infinity);
  return new Blob([JSON.stringify(tytPayload(document, history), null, 2)], {
    type: "application/vnd.tyter+json",
  });
}
export function readTYT(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Файл TYT повреждён: не удалось прочитать данные.");
  }
  if (payload?.format !== "tyter" || payload.version !== 1)
    throw new Error("Неизвестная версия файла TYT.");
  const document = validateImport(payload.document);
  const history = (Array.isArray(payload.history) ? payload.history : [])
    .slice(-10000)
    .filter((item) => item?.snapshot && Number.isFinite(item.createdAt))
    .map((item) => ({
      createdAt: item.createdAt,
      area: revisionArea(item),
      label:
        typeof item.label === "string" ? item.label.slice(0, 300) : "Импорт",
      snapshot: snapshotOf(
        validateImport({
          ...document,
          ...item.snapshot,
          scriptVersion: scriptVersionId(item.snapshot),
          scriptVersions: {},
        }),
      ),
    }));
  return { ...document, importedHistory: history };
}
