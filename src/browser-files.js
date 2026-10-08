import { tytPayload, readTYT } from "./tyt-format.js";
import { importRevisions, listRevisions } from "./history.js";
import { friendlyTytName } from "./local-file-names.js";

const DATABASE = "tyter.local-files.v1";
let directory = null;
let libraryRevision = null;
export const localLibraryRevision = () => libraryRevision;
let fileWork = Promise.resolve();
function withFileWork(work) {
  const next = fileWork
    .catch(() => {})
    .then(() =>
      navigator.locks
        ? navigator.locks.request("tyter-local-files", work)
        : work(),
    );
  fileWork = next;
  return next;
}
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
  directory = await read("directory");
  if (
    !directory ||
    (await directory.queryPermission({ mode: "readwrite" })) !== "granted"
  )
    return null;
  return directory;
}
export async function directoryComponentLibraries() {
  const folder = await connectedDirectory();
  if (!folder) return [];
  const { readComponentLibrary } = await import("./component-library.js");
  const libraries = [];
  for await (const handle of folder.values()) {
    if (
      handle.kind !== "file" ||
      !/\.tytl$/i.test(handle.name) ||
      libraries.length >= 100
    )
      continue;
    try {
      const file = await handle.getFile();
      if (file.size <= 50 * 1024 * 1024)
        libraries.push(readComponentLibrary(await file.text()));
    } catch {
      /* A damaged library must not prevent opening the screenplay folder. */
    }
  }
  return [
    ...new Map(libraries.map((library) => [library.id, library])).values(),
  ];
}
async function fileDocumentId(handle) {
  let file;
  try {
    file = await handle.getFile();
  } catch (error) {
    if (error.name === "NotFoundError") return null;
    throw error;
  }
  if (file.size > 50 * 1024 * 1024) return null;
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  return payload?.format === "tyter" &&
    payload.version === 1 &&
    /^[\w-]{1,100}$/.test(payload.document?.id || "") &&
    payload.document?.content?.type === "doc" &&
    Array.isArray(payload.document.content.content)
    ? payload.document.id
    : null;
}
async function inventoryOf(folder) {
  const entries = [];
  for await (const handle of folder.values())
    entries.push({
      name: handle.name,
      handle,
      id:
        handle.kind === "file" && /\.tyt$/i.test(handle.name)
          ? await fileDocumentId(handle)
          : null,
    });
  return entries;
}
async function mappingOf(folder) {
  const stored = await read("namedFiles");
  const same =
    stored?.directory && (await stored.directory.isSameEntry(folder));
  return {
    names: new Map(same ? Object.entries(stored.names || {}) : []),
    obsolete: same ? stored.obsolete || [] : [],
  };
}
const saveMapping = (folder, mapping) =>
  write({
    namedFiles: {
      directory: folder,
      names: Object.fromEntries(mapping.names),
      obsolete: mapping.obsolete,
    },
  });
function primaryFile(document, mapping, entries) {
  const owned = entries.filter((entry) => entry.id === document.id);
  return (
    owned.find((entry) => entry.name === mapping.names.get(document.id)) ||
    owned.find((entry) => entry.name === document.id + ".tyt") ||
    (owned.length === 1
      ? owned[0]
      : owned.find(
          (entry) =>
            entry.name === friendlyTytName(document.title, entry, entries),
        ))
  );
}
async function cleanObsolete(folder, mapping, entries, id) {
  for (const old of [...mapping.obsolete].filter((entry) => entry.id === id)) {
    let handle;
    try {
      handle = await folder.getFileHandle(old.name);
    } catch (error) {
      if (error.name !== "NotFoundError") throw error;
    }
    const owner = handle ? await fileDocumentId(handle) : null;
    if (owner === id) await folder.removeEntry(old.name);
    const entry = entries.find((entry) => entry.name === old.name);
    if (entry && (!handle || owner === id))
      entries.splice(entries.indexOf(entry), 1);
    else if (entry) entry.id = owner;
    mapping.obsolete = mapping.obsolete.filter((entry) => entry !== old);
  }
  await saveMapping(folder, mapping);
}
async function saveNamedDocument(folder, mapping, entries, document) {
  // Two passes also handle a case-only rename on Windows: save a temporary
  // numbered copy before removing the original, then use the requested spelling.
  for (let pass = 0; pass < 2; pass++) {
    const primary = primaryFile(document, mapping, entries);
    const name = friendlyTytName(document.title, primary, entries);
    const existed = entries.some((entry) => entry.name === name);
    const handle = await folder.getFileHandle(name, { create: true });
    const actual = await handle.getFile();
    if (actual.size && (await fileDocumentId(handle)) !== document.id)
      throw new Error("Имя файла уже занято другим документом.");
    let writable;
    try {
      writable = await handle.createWritable();
      await writable.write(
        JSON.stringify(
          tytPayload(document, await listRevisions(document.id, Infinity)),
        ),
      );
      await writable.close();
    } catch (error) {
      await writable?.abort().catch(() => {});
      if (!existed && (await handle.getFile()).size === 0)
        await folder.removeEntry(name);
      throw error;
    }
    const saved = { name: handle.name, handle, id: document.id };
    const index = entries.findIndex((entry) => entry.name === saved.name);
    if (index < 0) entries.push(saved);
    else entries[index] = saved;
    mapping.names.set(document.id, saved.name);
    if (
      primary &&
      primary.name !== saved.name &&
      !mapping.obsolete.some(
        (entry) => entry.id === document.id && entry.name === primary.name,
      )
    )
      mapping.obsolete.push({ id: document.id, name: primary.name });
    // Record the new file before deleting the old one, so an interrupted rename
    // can finish on the next save without losing either the data or its identity.
    await saveMapping(folder, mapping);
    await cleanObsolete(folder, mapping, entries, document.id);
    if (friendlyTytName(document.title, saved, entries) === saved.name) return;
  }
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
  return withFileWork(async () => {
    const documents = new Map();
    const mapping = await mappingOf(chosen);
    for await (const entry of chosen.values()) {
      if (entry.kind !== "file" || !/\.tyt$/i.test(entry.name)) continue;
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
      const previous = documents.get(document.id);
      if (!previous || document.updatedAt > previous.updatedAt)
        documents.set(document.id, document);
      if (!mapping.names.has(document.id))
        mapping.names.set(document.id, entry.name);
    }
    // Replace the active library only after the entire folder has been read.
    // Keep a recovery copy of browser-only projects when first connecting a folder.
    const previousDirectory = await read("directory");
    const previousDocuments = (await read("documents")) || [];
    const nextRevision = crypto.randomUUID();
    const selected = [...documents.values()];
    const deletedIds = ((await read("deletedIds")) || []).filter(
      (id) => !documents.has(id),
    );
    await write({
      ...(!previousDirectory ? { browserDocuments: previousDocuments } : {}),
      directory: chosen,
      documents: selected,
      libraryRevision: nextRevision,
      deletedIds,
    });
    directory = chosen;
    libraryRevision = nextRevision;
    await saveMapping(chosen, mapping);
    await navigator.storage?.persist?.().catch(() => {});
    return { documents: selected, name: directory.name, libraryRevision };
  });
}
export async function browserRequest(endpoint, body) {
  if (endpoint === "documents" && body === undefined) {
    return withFileWork(async () => {
      libraryRevision = (await read("libraryRevision")) || null;
      const folder = await read("directory");
      return {
        documents: (await read("documents")) || [],
        deletedIds: (await read("deletedIds")) || [],
        directoryName: folder?.name || null,
        libraryRevision,
      };
    });
  }
  if (endpoint === "documents") {
    return withFileWork(async () => {
      if (
        Object.hasOwn(body, "libraryRevision") &&
        body.libraryRevision !== ((await read("libraryRevision")) || null)
      )
        throw new Error(
          "Папка сценариев изменена в другой вкладке. Обновите страницу.",
        );
      // A tab signing out may hold an older snapshot than another open tab.
      const deleted = new Set((await read("deletedIds")) || []);
      const merged = new Map(
        ((await read("documents")) || [])
          .filter((document) => !deleted.has(document.id))
          .map((document) => [document.id, document]),
      );
      for (const document of body.documents) {
        if (deleted.has(document.id)) continue;
        const previous = merged.get(document.id);
        if (!previous || document.updatedAt >= previous.updatedAt)
          merged.set(document.id, document);
      }
      const documents = [...merged.values()];
      await write({ documents });
      const folder = await connectedDirectory();
      if (folder) {
        const mapping = await mappingOf(folder);
        const entries = await inventoryOf(folder);
        for (const document of documents) {
          await saveNamedDocument(folder, mapping, entries, document);
        }
        // An earlier document may now be able to drop its collision suffix after
        // another document was renamed in the same batch.
        for (const document of documents) {
          const primary = primaryFile(document, mapping, entries);
          if (
            primary &&
            friendlyTytName(document.title, primary, entries) !== primary.name
          )
            await saveNamedDocument(folder, mapping, entries, document);
        }
      }
      return { saved: true, needsPermission: !!directory && !folder };
    });
  }
  if (endpoint === "delete-document") {
    return withFileWork(async () => {
      if (
        Object.hasOwn(body, "libraryRevision") &&
        body.libraryRevision !== ((await read("libraryRevision")) || null)
      )
        throw new Error(
          "Папка сценариев изменена в другой вкладке. Обновите страницу.",
        );
      const deletedIds = [
        ...new Set([...((await read("deletedIds")) || []), body.id]),
      ];
      const before = (await read("documents")) || [];
      const removed = before.find((item) => item.id === body.id);
      const documents = before.filter((item) => item.id !== body.id);
      await write({ deletedIds, documents });
      const folder = await connectedDirectory();
      if (folder) {
        const mapping = await mappingOf(folder);
        const entries = await inventoryOf(folder);
        const primary =
          removed || mapping.names.has(body.id)
            ? primaryFile(
                removed || { id: body.id, title: "" },
                mapping,
                entries,
              )
            : entries.find(
                (entry) =>
                  entry.id === body.id && entry.name === body.id + ".tyt",
              );
        if (primary) mapping.obsolete.push({ id: body.id, name: primary.name });
        await saveMapping(folder, mapping);
        await cleanObsolete(folder, mapping, entries, body.id);
        mapping.names.delete(body.id);
        await saveMapping(folder, mapping);
      }
      return { deleted: true };
    });
  }
  throw new Error("Неизвестное действие с локальными файлами.");
}
