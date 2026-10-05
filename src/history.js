import { HISTORY_DAYS } from "./edition.js";

const DATABASE = "tyter.history.v1";
const STORE = "revisions";
export const FREE_HISTORY_DAYS = 14;
export const revisionArea = (revision) =>
  revision.area === "outline" ||
  (!revision.area && revision.label?.includes("аутлайна"))
    ? "outline"
    : "screenplay";
export const snapshotForArea = (snapshot, area) => {
  if (area === "outline")
    return { outline: snapshot.outline || { columns: [], cards: [] } };
  const { outline, ...screenplay } = snapshot;
  return screenplay;
};

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
    content: document.content,
    components: document.components,
    componentFolders: document.componentFolders || [],
    collapsedComponentFolders: document.collapsedComponentFolders || [],
    comments: document.comments,
    metadata: document.metadata,
    props: document.props || [],
    settings: document.settings || {},
    outline: document.outline || { columns: [], cards: [] },
  };
}

export function changeLabel(before, after) {
  const names = [
    ["content", "текста"],
    ["components", "компонентов"],
    ["componentFolders", "папок"],
    ["comments", "комментариев"],
    ["metadata", "настроек"],
    ["props", "реквизита"],
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
