import { browserRequest } from "./browser-files.js";

export const WORKSPACE_SESSION_STORAGE = "tyter.workspace-session.v1";
const CLIENT_STORAGE = "tyter.workspace-client.v1";
const uuid = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
let session, client;
export function hasWorkspaceSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_SESSION_STORAGE));
    return saved?.schema === 1 && typeof saved.id === "string" && !!saved.id;
  } catch {
    return !!session;
  }
}
export function workspaceSession() {
  if (!session) {
    try {
      session = JSON.parse(localStorage.getItem(WORKSPACE_SESSION_STORAGE));
    } catch {}
    if (
      session?.schema !== 1 ||
      typeof session.id !== "string" ||
      !session.id
    ) {
      session = { schema: 1, id: uuid(), transport: "local" };
      try {
        localStorage.setItem(
          WORKSPACE_SESSION_STORAGE,
          JSON.stringify(session),
        );
      } catch {}
    }
  }
  if (!client) {
    try {
      client = sessionStorage.getItem(CLIENT_STORAGE);
    } catch {}
    if (!client) {
      client = uuid();
      try {
        sessionStorage.setItem(CLIENT_STORAGE, client);
      } catch {}
    }
  }
  return { ...session, clientId: client };
}

// This boundary carries a complete document, including every script version,
// comment, outline and library. A future remote adapter can implement the same
// request contract; identity alone does not implement multiplayer conflicts.
export async function sessionLibraryRequest(
  endpoint,
  body,
  adapter = browserRequest,
) {
  const identity = workspaceSession();
  const result = await adapter(endpoint, body, identity);
  return { ...result, session: identity };
}
