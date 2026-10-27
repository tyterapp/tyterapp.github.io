import { HISTORY_DAYS } from "./edition.js";
import { scriptVersionId } from "./script-versions.js";
import { migrateStoryboard } from "./storyboard-model.js";

const DATABASE = "tyter.dildamode.history.v1";
const STORE = "revisions";
export const FREE_HISTORY_DAYS = 14;
export const revisionArea = (revision) =>
  revision.area === "notes"
    ? "notes"
    : revision.area === "storyboard"
      ? "storyboard"
      : revision.area === "outline" ||
          (!revision.area && revision.label?.includes("аутлайна"))
        ? "outline"
        : "screenplay";
export const snapshotForArea = (snapshot, area) => {
  if (area === "notes") return { notes: snapshot.notes || null };
  if (area === "storyboard")
    return Object.fromEntries(
      [
        "content",
        "pageVersions",
        "sceneVariants",
        "sceneShots",
        "comments",
        "storyboardVersion",
      ]
        .filter((key) => key in snapshot)
        .map((key) => [key, snapshot[key]]),
    );
  if (area === "outline")
    return {
      outline: snapshot.outline || { columns: [], cards: [] },
    };
  const { outline, notes, ...screenplay } = snapshot;
  return screenplay;
};

export function restoreSnapshotForArea(document, snapshot, area) {
  const restored = {
    ...document,
    ...structuredClone(snapshotForArea(snapshot, area)),
  };
  // A snapshot created before page versions cannot reuse today's ranges or
  // alternatives: its text may have entirely different paragraph boundaries.
  // The editor measures and migrates that restored legacy content on entry.
  if (area === "screenplay" && !snapshot.pageVersions)
    restored.pageVersions = undefined;
  return area === "outline"
    ? migrateStoryboard({ ...restored, storyboardVersion: undefined })
    : restored;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, {
        keyPath: "id",
        autoIncrement: true,
      });
      store.createIndex("documentId", "documentId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function snapshotOf(document) {
  return {
    title: document.title,
    scriptVersion: scriptVersionId(document),
    revisionRound: document.revisionRound,
    content: document.content,
    ...(document.pageVersions ? { pageVersions: document.pageVersions } : {}),
    notes: document.notes || null,
    sceneVariants: document.sceneVariants || {},
    sceneShots: document.sceneShots || {},
    storyboardVersion: document.storyboardVersion || 1,
    components: document.components,
    relationships: document.relationships || [],
    ...(document.graphLayout ? { graphLayout: document.graphLayout } : {}),
    ...(document.componentLibraryId
      ? { componentLibraryId: document.componentLibraryId }
      : {}),
    componentFolders: document.componentFolders || [],
    collapsedComponentFolders: document.collapsedComponentFolders || [],
    comments: document.comments,
    metadata: document.metadata,
    props: document.props || [],
    propFolders: document.propFolders || [],
    collapsedPropFolders: document.collapsedPropFolders || [],
    settings: document.settings || {},
    outline: document.outline || { columns: [], cards: [] },
  };
}

export function changeLabel(before, after) {
  const names = [
    ["content", "текста"],
    ["pageVersions", "цветов страниц"],
    ["notes", "заметок"],
    ["sceneVariants", "вариантов сцен"],
    ["sceneShots", "раскадровки"],
    ["components", "компонентов"],
    ["relationships", "связей персонажей"],
    ["componentFolders", "папок"],
    ["comments", "комментариев"],
    ["metadata", "настроек"],
    ["props", "реквизита"],
    ["propFolders", "папок реквизита"],
    ["settings", "параметров"],
    ["title", "названия"],
    ["outline", "аутлайна"],
  ];
  return (
    names
      .filter(
        ([key]) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
      )
      .map(([, label]) => label)
      .join(", ") || "документа"
  );
}

export async function listRevisions(documentId, historyDays = HISTORY_DAYS) {
  const database = await openDatabase();
  try {
    const rows = await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction
        .objectStore(STORE)
        .index("documentId")
        .getAll(documentId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const cutoff = Date.now() - historyDays * 24 * 60 * 60 * 1000;
    // Installed Pro keeps all snapshots; the browser trial keeps 14 days.
    const storedCutoff = cutoff;
    const expired = rows.filter((row) => row.createdAt < storedCutoff);
    if (expired.length)
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        for (const row of expired)
          transaction.objectStore(STORE).delete(row.id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    return rows
      .filter((row) => row.createdAt >= cutoff)
      .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
  } finally {
    database.close();
  }
}

export async function recordRevision(
  documentId,
  snapshot,
  label,
  historyDays = HISTORY_DAYS,
  area = "screenplay",
) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).add({
        documentId,
        createdAt: Date.now(),
        label,
        area,
        snapshot: structuredClone(snapshot),
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
  await listRevisions(documentId, historyDays);
}

export async function deleteRevisions(documentId) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const request = transaction
        .objectStore(STORE)
        .index("documentId")
        .getAllKeys(documentId);
      request.onsuccess = () => {
        for (const id of request.result)
          transaction.objectStore(STORE).delete(id);
      };
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function deleteScriptVersionRevisions(documentId, version) {
  if (version === "white") return;
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const index = store.index("documentId");
      for (const scope of [documentId, `${documentId}::script::${version}`]) {
        const request = index.getAll(scope);
        request.onsuccess = () => {
          for (const row of request.result) {
            const area = revisionArea(row);
            const sharedNotes =
              area === "notes" ||
              (area === "screenplay" && row.label?.includes("замет"));
            if (
              !sharedNotes &&
              (scope !== documentId ||
                scriptVersionId(row.snapshot) === version)
            )
              store.delete(row.id);
          }
        };
      }
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function importRevisions(
  documentId,
  rows,
  historyDays = HISTORY_DAYS,
) {
  if (!rows.length) return;
  const existing = await listRevisions(documentId, historyDays);
  const signatures = new Set(
    existing.map(
      (row) =>
        row.createdAt +
        ":" +
        revisionArea(row) +
        ":" +
        JSON.stringify(row.snapshot),
    ),
  );
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      for (const row of rows) {
        const signature =
          row.createdAt +
          ":" +
          revisionArea(row) +
          ":" +
          JSON.stringify(snapshotOf(row.snapshot));
        if (signatures.has(signature)) continue;
        signatures.add(signature);
        transaction.objectStore(STORE).add({
          documentId,
          createdAt: row.createdAt,
          label: row.label,
          area: revisionArea(row),
          snapshot: structuredClone(snapshotOf(row.snapshot)),
        });
      }
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
  await listRevisions(documentId, historyDays);
}
