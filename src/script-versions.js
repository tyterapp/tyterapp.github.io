import { SCRIPT_VERSIONS } from "./script-version-colors.js";
import { cleanRevisionRound, nextRevisionRound } from "./script-revisions.js";
export { SCRIPT_VERSIONS };
const ids = new Set(SCRIPT_VERSIONS.map((version) => version.id));
// These fields belong to a writing version. The file ID, title and quota remain
// properties of the containing document, so it stays a single local file.
const fields = [
  "content",
  "revisionRound",
  "sceneVariants",
  "sceneShots",
  "storyboardVersion",
  "outline",
  "components",
  "relationships",
  "graphLayout",
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

export const isScriptVersionCopy = (document, id) =>
  ids.has(id) &&
  id !== "white" &&
  (scriptVersionId(document) === id
    ? !!document.scriptVersions?.white
    : !!document.scriptVersions?.[id]);

export function removeScriptVersion(document, id) {
  if (!isScriptVersionCopy(document, id)) return null;
  const wasActive = scriptVersionId(document) === id;
  const snapshot = scriptVersionSnapshot(
    wasActive ? document : document.scriptVersions[id],
  );
  const next = wasActive ? switchScriptVersion(document, "white") : document;
  const versions = { ...next.scriptVersions };
  delete versions[id];
  return {
    document: { ...next, scriptVersions: versions },
    snapshot,
    wasActive,
    fallback: scriptVersionId(next),
  };
}

export function restoreScriptVersion(
  document,
  id,
  snapshot,
  { activate = false } = {},
) {
  if (
    !ids.has(id) ||
    id === "white" ||
    scriptVersionId(document) === id ||
    document.scriptVersions?.[id]
  )
    return document;
  const restored = {
    ...document,
    scriptVersions: {
      ...document.scriptVersions,
      [id]: scriptVersionSnapshot(snapshot),
    },
  };
  return activate ? switchScriptVersion(restored, id) : restored;
}

export function switchScriptVersion(document, id) {
  const previous = scriptVersionId(document);
  if (!ids.has(id) || previous === id) return document;
  const versions = {
    ...(document.scriptVersions || {}),
    [previous]: scriptVersionSnapshot(document),
  };
  const next = scriptVersionSnapshot(versions[id] || document);
  next.revisionRound = versions[id]
    ? cleanRevisionRound(next.revisionRound, id)
    : nextRevisionRound(document);
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
      cleanSnapshot({ ...source.scriptVersions[id], scriptVersion: id }),
    );
  }
  return { scriptVersion: active, scriptVersions: versions };
}
