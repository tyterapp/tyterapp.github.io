import { tytPayload, readTYT } from "./tyt-format.js";
import { importRevisions, listRevisions } from "./history.js";

const DATABASE = "tyter.local-files.v1";
let directory = null;
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function read(key) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("files").objectStore("files").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function write(values) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      for (const [key, value] of Object.entries(values))
        tx.objectStore("files").put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function connectedDirectory() {
  directory ||= await read("directory");
  if (
    !directory ||
    (await directory.queryPermission({ mode: "readwrite" })) !== "granted"
  )
    return null;
  return directory;
}
export async function chooseLocalDirectory() {
  if (!window.showDirectoryPicker)
    throw new Error(
      "В этом браузере документы хранятся локально в браузере. Скачайте копию TYT; для автосохранения в папку откройте Pro в Chrome или Edge.",
    );
  // Keep the picker directly inside the user's click to preserve browser activation.
  const chosen = await window.showDirectoryPicker({
    mode: "readwrite",
    id: "tyter-projects",
  });
  const documents = [];
  for await (const entry of chosen.values()) {
    if (entry.kind !== "file" || !entry.name.endsWith(".tyt")) continue;
    const file = await entry.getFile();
    if (file.size > 50 * 1024 * 1024) continue;
    // Never overwrite a damaged or unrelated TYT file silently.
    const document = readTYT(await file.text());
    await importRevisions(
      document.id,
      document.importedHistory || [],
      Infinity,
    );
    delete document.importedHistory;
    documents.push(document);
  }
  directory = chosen;
  await write({ directory });
  await navigator.storage?.persist?.().catch(() => {});
  return { documents, name: directory.name };
}
export async function browserRequest(endpoint, body) {
  if (endpoint === "documents" && body === undefined) {
    return {
      documents: (await read("documents")) || [],
      deletedIds: (await read("deletedIds")) || [],
    };
  }
  if (endpoint === "documents") {
    await write({ documents: body.documents });
    const folder = await connectedDirectory();
    if (folder) {
      for (const document of body.documents) {
        const file = await folder.getFileHandle(document.id + ".tyt", {
          create: true,
        });
        const writable = await file.createWritable();
        await writable.write(
          JSON.stringify(
            tytPayload(document, await listRevisions(document.id, Infinity)),
          ),
        );
        await writable.close();
      }
    }
    return { saved: true, needsPermission: !!directory && !folder };
  }
  if (endpoint === "delete-document") {
    const deletedIds = [
      ...new Set([...((await read("deletedIds")) || []), body.id]),
    ];
    const documents = ((await read("documents")) || []).filter(
      (item) => item.id !== body.id,
    );
    await write({ deletedIds, documents });
    const folder = await connectedDirectory();
    if (folder) {
      // Only delete the exact app-owned file for the confirmed document.
      await folder.removeEntry(body.id + ".tyt").catch((error) => {
        if (error.name !== "NotFoundError") throw error;
      });
    }
    return { deleted: true };
  }
  throw new Error("Неизвестное действие с локальными файлами.");
}
