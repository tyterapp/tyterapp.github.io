import { uid, validateImport } from "./data.js";

const FORMAT = "tyter-component-library";
export function libraryFromDocument(document, selected) {
  return readComponentLibrary(
    JSON.stringify({
      format: FORMAT,
      version: 1,
      id: document.componentLibraryId || document.id,
      name: document.title,
      components: selected
        ? document.components.filter((c) => selected.includes(c.id))
        : document.components,
      folders: document.componentFolders || [],
      updatedAt: new Date().toISOString(),
    }),
  );
}
export function readComponentLibrary(text) {
  if (typeof text !== "string" || text.length > 50 * 1024 * 1024)
    throw new Error("Библиотека слишком большая: максимум 50 МБ.");
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("Не удалось прочитать библиотеку компонентов.");
  }
  if (input?.format === "tyter" && input.version === 1)
    input = {
      format: FORMAT,
      version: 1,
      id: input.document?.id,
      name: input.document?.title,
      components: input.document?.components,
      folders: input.document?.componentFolders,
    };
  if (
    input?.format !== FORMAT ||
    input.version !== 1 ||
    !Array.isArray(input.components) ||
    input.components.length > 10000
  )
    throw new Error("Выберите библиотеку TYTL или сценарий TYT.");
  const validated = validateImport({
    id: input.id,
    title: input.name,
    components: input.components,
    componentFolders: input.folders,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { format: "scene", blockId: "library" } },
      ],
    },
  });
  return {
    format: FORMAT,
    version: 1,
    id: validated.id,
    name: validated.title,
    components: validated.components.map(
      ({ librarySource, enabled, ...component }) => component,
    ),
    folders: validated.componentFolders,
    updatedAt: new Date().toISOString(),
  };
}
export function exportComponentLibrary(document, selected) {
  return new Blob(
    [JSON.stringify(libraryFromDocument(document, selected), null, 2)],
    {
      type: "application/vnd.tyter-library+json",
    },
  );
}
export function mergeComponentLibrary(document, library, selected) {
  const components = document.components.map((component) =>
      component.librarySource?.libraryId === library.id
        ? {
            ...component,
            enabled: selected.includes(component.librarySource.componentId),
          }
        : component,
    ),
    folders = [...(document.componentFolders || [])];
  const normalize = (name) => name.trim().toLocaleLowerCase();
  let added = 0,
    updated = 0,
    skipped = 0;
  const folderMap = new Map();
  for (const original of library.folders) {
    const folder = folders.find(
      (f) => normalize(f.name) === normalize(original.name),
    ) || { ...original, id: uid() };
    if (!folders.some((f) => f.id === folder.id)) folders.push(folder);
    folderMap.set(original.id, folder.id);
  }
  for (const original of library.components.filter((item) =>
    selected.includes(item.id),
  )) {
    const existing = components.findIndex(
      (item) =>
        item.librarySource?.libraryId === library.id &&
        item.librarySource.componentId === original.id,
    );
    const collision = components.findIndex(
      (item, index) =>
        index !== existing && normalize(item.name) === normalize(original.name),
    );
    if (collision >= 0) {
      skipped++;
      continue;
    }
    const imported = {
      ...original,
      id: existing >= 0 ? components[existing].id : uid(),
      folderId: folderMap.get(original.folderId) || null,
      enabled: true,
      librarySource: {
        libraryId: library.id,
        componentId: original.id,
        name: library.name,
      },
    };
    if (existing >= 0) {
      components[existing] = imported;
      updated++;
    } else {
      components.push(imported);
      added++;
    }
  }
  return {
    document: { ...document, components, componentFolders: folders },
    added,
    updated,
    skipped,
  };
}
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("tyter.component-libraries.v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("libraries", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function localComponentLibraries(library) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(
        "libraries",
        library ? "readwrite" : "readonly",
      );
      const store = transaction.objectStore("libraries");
      if (library) store.put(library);
      const request = store.getAll();
      let result = [];
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
