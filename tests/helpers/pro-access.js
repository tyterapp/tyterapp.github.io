import {
  PRO_CODES_URL,
  PRO_SESSION_STORAGE,
  proPairProof,
  createProAccessList,
} from "../../src/pro-access.js";

export const login = { code: "ABC123", email: "pro@example.test" };
export const codes =
  "\uFEFF[abc123][Pro@Example.Test]\r\n[XYZ987][second@example.test]\r\n[EMPTY1][]\r\n[PEND01][null]\r\n[BAD001][not-an-email]\r\n";
export const codesRoute = PRO_CODES_URL + "*";
export const listResponse = async (text = codes, status = 200) => ({
  status,
  contentType: "text/plain; charset=utf-8",
  headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  body: status === 200 ? await createProAccessList(text) : text,
});
export async function grantPro(page) {
  await page.route(codesRoute, async (route) =>
    route.fulfill(await listResponse()),
  );
  const proof = await proPairProof(login.code, login.email);
  await page.addInitScript(
    ({ storage, proof }) => {
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem(storage, proof);
    },
    { storage: PRO_SESSION_STORAGE, proof },
  );
  return proof;
}
export const storedProof = (page) =>
  page.evaluate(
    (storage) => localStorage.getItem(storage),
    PRO_SESSION_STORAGE,
  );
export const localDocumentCount = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("tyter.local-files.v1", 1);
        open.onsuccess = () => {
          const database = open.result;
          const request = database
            .transaction("files")
            .objectStore("files")
            .get("documents");
          request.onsuccess = () => {
            resolve(request.result?.length || 0);
            database.close();
          };
          request.onerror = () => {
            reject(request.error);
            database.close();
          };
        };
        open.onerror = () => reject(open.error);
      }),
  );
