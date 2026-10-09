export const SCRIPT_VERSIONS = [
  { id: "white", label: "v1 White", hue: 0, chroma: 0 },
  { id: "blue", label: "v2 Blue", hue: 240, chroma: 0.012 },
  { id: "pink", label: "v3 Pink", hue: 350, chroma: 0.012 },
  { id: "yellow", label: "v4 Yellow", hue: 105, chroma: 0.016 },
  { id: "green", label: "v5 Green", hue: 145, chroma: 0.012 },
  { id: "goldenrod", label: "v6 Goldenrod", hue: 85, chroma: 0.016 },
  { id: "buff", label: "v7 Buff", hue: 65, chroma: 0.012 },
  { id: "salmon", label: "v8 Salmon", hue: 35, chroma: 0.012 },
  { id: "cherry", label: "v9 Cherry", hue: 5, chroma: 0.012 },
];
const ids = new Set(SCRIPT_VERSIONS.map((version) => version.id));
// These fields belong to a writing version. The file ID, title and quota remain
// properties of the containing document, so it stays a single local file.
const fields = [
  "content",
  "sceneVariants",
  "outline",
  "components",
  "componentLibraryId",
  "componentFolders",
  "collapsedComponentFolders",
  "props",
  "propFolders",
  "collapsedPropFolders",
  "comments",
  "settings",
  "metadata",
  "cover",
];
export const scriptVersionId = (document) =>
  ids.has(document?.scriptVersion) ? document.scriptVersion : "white";
export const scriptScopeId = (document) =>
  scriptVersionId(document) === "white"
    ? document.id
    : `${document.id}::script::${scriptVersionId(document)}`;
export const scriptVersion = (document) =>
  SCRIPT_VERSIONS.find((version) => version.id === scriptVersionId(document));
export const scriptVersionSnapshot = (document) =>
  structuredClone(
    Object.fromEntries(
      fields
        .filter((field) => Object.hasOwn(document, field))
        .map((field) => [field, document[field]]),
    ),
  );

export function switchScriptVersion(document, id) {
  const previous = scriptVersionId(document);
  if (!ids.has(id) || previous === id) return document;
  const versions = {
    ...(document.scriptVersions || {}),
    [previous]: scriptVersionSnapshot(document),
  };
  const next = scriptVersionSnapshot(versions[id] || document);
  if (!versions[id])
    next.componentLibraryId =
      globalThis.crypto?.randomUUID?.() ||
      `library-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  // The active version is already in the document's ordinary fields. Only
  // inactive snapshots are archived, avoiding a second copy on every keystroke.
  delete versions[id];
  const base = Object.fromEntries(
    Object.entries(document).filter(([field]) => !fields.includes(field)),
  );
  return { ...base, ...next, scriptVersion: id, scriptVersions: versions };
}

export function cleanScriptVersions(source, cleanSnapshot) {
  const active = scriptVersionId(source);
  const versions = {};
  for (const { id } of SCRIPT_VERSIONS) {
    if (id === active || !Object.hasOwn(source.scriptVersions || {}, id))
      continue;
    // A broken dormant version must not silently disappear during import.
    versions[id] = scriptVersionSnapshot(
      cleanSnapshot(source.scriptVersions[id]),
    );
  }
  return { scriptVersion: active, scriptVersions: versions };
}
