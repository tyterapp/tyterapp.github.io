import { localLibraryRevision } from "./browser-files.js";
import {
  hasWorkspaceSession,
  sessionLibraryRequest,
} from "./workspace-session.js";
import { isMobileWorkspace } from "./mobile-workspace.js";
let pending = Promise.resolve();
const mobileAtStart = isMobileWorkspace();
export const isWebPro = () =>
  !window.tyterDesktop?.request && /\/(pro|beta)\/?$/.test(location.pathname);
export const usesBrowserLibrary = () => true;
export async function localRequest(endpoint, body) {
  return sessionLibraryRequest(endpoint, body);
}
export function saveLocalFiles(documents) {
  const snapshot = structuredClone(documents);
  const revision = usesBrowserLibrary()
    ? { libraryRevision: localLibraryRevision() }
    : {};
  const next = pending
    .catch(() => {})
    .then(() =>
      localRequest("documents", { documents: snapshot, ...revision }),
    );
  pending = next;
  return next;
}
export function deleteLocalFile(id) {
  const revision = usesBrowserLibrary()
    ? { libraryRevision: localLibraryRevision() }
    : {};
  const next = pending
    .catch(() => {})
    .then(() => localRequest("delete-document", { id, ...revision }));
  pending = next;
  return next;
}

export async function sessionExportSnapshot(documents, id) {
  const fallback = structuredClone(
    documents.find((document) => document.id === id),
  );
  if (!usesBrowserLibrary()) return fallback;
  try {
    await saveLocalFiles(documents);
    const stored = await localRequest("documents");
    return structuredClone(
      stored.documents.find((document) => document.id === id) || fallback,
    );
  } catch {
    // Export remains a recovery path when local persistence is unavailable.
    return fallback;
  }
}
