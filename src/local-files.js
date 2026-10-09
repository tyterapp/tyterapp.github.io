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
export const usesBrowserLibrary = () =>
  !window.tyterDesktop?.request &&
  (isWebPro() || mobileAtStart || hasWorkspaceSession());
export async function localRequest(endpoint, body) {
  if (window.tyterDesktop?.request)
    return window.tyterDesktop.request(endpoint, body);
  if (usesBrowserLibrary()) {
    return sessionLibraryRequest(endpoint, body);
  }
  const response = await fetch(`/__tyter_local/${endpoint}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-Tyter-Local": "1",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error(`Локальное сохранение недоступно (${response.status}).`);
  return response.json();
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
