import { browserRequest, localLibraryRevision } from "./browser-files.js";
let pending = Promise.resolve();
export const isWebPro = () =>
  !window.tyterDesktop?.request && /\/pro\/?$/.test(location.pathname);
export async function localRequest(endpoint, body) {
  if (window.tyterDesktop?.request)
    return window.tyterDesktop.request(endpoint, body);
  if (isWebPro()) {
    return browserRequest(endpoint, body);
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
  const revision = isWebPro()
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
  const revision = isWebPro()
    ? { libraryRevision: localLibraryRevision() }
    : {};
  const next = pending
    .catch(() => {})
    .then(() => localRequest("delete-document", { id, ...revision }));
  pending = next;
  return next;
}
