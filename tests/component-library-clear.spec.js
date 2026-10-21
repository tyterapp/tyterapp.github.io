import { test, expect } from "@playwright/test";
import { componentClearFixture } from "./helpers/component-clear-fixture.js";
import { clearDocumentComponents } from "../src/component-clear.js";
import { grantPro } from "./helpers/pro-access.js";
import { validateImport } from "../src/data.js";

const readStore = (page, name, store, key) =>
  page.evaluate(
    ({ name, store, key }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(store)) {
            db.close();
            resolve(undefined);
            return;
          }
          const get = db.transaction(store).objectStore(store).get(key);
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
          get.onerror = () => {
            reject(get.error);
            db.close();
          };
        };
      }),
    { name, store, key },
  );
const documents = async (page) => {
  const browserFiles = await readStore(
    page,
    "tyter.local-files.v1",
    "files",
    "documents",
  );
  const browserCopy = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tyter.projects.v1") || "[]"),
  );
  const latest = new Map(
    browserCopy.map((document) => [document.id, document]),
  );
  for (const document of browserFiles || [])
    if (
      !latest.has(document.id) ||
      document.updatedAt >= latest.get(document.id).updatedAt
    )
      latest.set(document.id, document);
  return [...latest.values()];
};
const stored = async (page) =>
  (await documents(page)).find((doc) => doc.id === "clear-document");
const savedLibrary = (page) =>
  readStore(page, "tyter.component-libraries.v1", "libraries", "saved-library");
const text = (document) =>
  document.content.content
    .map((block) =>
      (block.content || []).map((node) => node.text || "").join(""),
    )
    .join("\n");

async function open(
  page,
  {
    language = "ru",
    theme = "light",
    mobile = false,
    pro = false,
    empty = false,
  } = {},
) {
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  if (pro) await grantPro(page);
  if (mobile) await page.setViewportSize({ width: 320, height: 844 });
  const fixture = componentClearFixture();
  fixture.other.quotaExempt = true;
  if (empty) fixture.document = clearDocumentComponents(fixture.document);
  fixture.document = validateImport(fixture.document);
  fixture.other = validateImport(fixture.other);
  await page.addInitScript(
    ({ fixture, language, theme }) => {
      if (sessionStorage.getItem("component-clear-seeded")) return;
      sessionStorage.setItem("component-clear-seeded", "yes");
      localStorage.setItem(
        "tyter.projects.v1",
        JSON.stringify([fixture.document, fixture.other]),
      );
      localStorage.setItem("tyter.active", fixture.document.id);
      localStorage.setItem("tyter.language.v1", language);
      localStorage.setItem("tyter.editor-intro.v1", "seen");
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { fixture, language, theme },
  );
  await page.goto(pro ? "/pro" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect.poll(async () => (await documents(page))?.length).toBe(2);
  await page.evaluate(
    (library) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("tyter.component-libraries.v1", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("libraries", { keyPath: "id" });
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("libraries", "readwrite");
          transaction.objectStore("libraries").put(library);
          transaction.oncomplete = () => {
            resolve();
            db.close();
          };
          transaction.onerror = () => {
            reject(transaction.error);
            db.close();
          };
        };
        request.onerror = () => reject(request.error);
      }),
    fixture.library,
  );
}

async function openLibrary(page, language = "ru", mobile = false) {
  const en = language === "en";
  if (mobile) await page.locator(".mobile-components-toggle").click();
  else
    await page
      .getByRole("button", {
        name: en ? "Components" : "Компоненты",
        exact: true,
      })
      .click();
  await page
    .getByRole("button", {
      name: en ? "Component libraries" : "Библиотеки компонентов",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: en ? "Component libraries" : "Библиотеки компонентов",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const settings of [
  { language: "ru", theme: "light", pro: false },
  { language: "en", theme: "dark", pro: true },
])
  test(`${settings.language} ${settings.theme}: clear only the current document, undo once, redo and persist without changing a saved library`, async ({
    page,
  }, info) => {
    await open(page, settings);
    const en = settings.language === "en";
    const before = await stored(page);
    const other = (await documents(page)).find(
      (doc) => doc.id === "other-document",
    );
    const library = await savedLibrary(page);
    let dialog = await openLibrary(page, settings.language);
    const clear = dialog.getByRole("button", {
      name: en ? "Clear components" : "Очистить компоненты",
      exact: true,
    });
    await expect(clear).toBeEnabled();
    await dialog
      .getByRole("checkbox", {
        name: en ? "Select all for export" : "Выбрать все для экспорта",
        exact: true,
      })
      .uncheck();
    await expect(clear).toBeEnabled(); // Clearing is independent from the export selection.
    await dialog
      .locator(".library-list button")
      .filter({ hasText: "Сохранённая библиотека" })
      .click();
    await expect(clear).toHaveCount(0);
    await dialog
      .getByRole("button", {
        name: en ? "Current document library" : "Библиотека текущего документа",
        exact: true,
      })
      .click();
    await page.screenshot({
      path: info.outputPath("clear-components-before.png"),
    });
    await clear.click();
    await expect(dialog.getByRole("status")).toHaveText(
      en
        ? "Components cleared. Text preserved."
        : "Компоненты очищены. Текст сохранён.",
    );
    await expect(dialog.locator(".library-components")).toContainText(
      en ? "No components yet" : "Пока нет компонентов",
    );
    await expect
      .poll(async () => (await stored(page)).components.length)
      .toBe(0);
    let after = await stored(page);
    expect(text(after)).toBe(text(before));
    expect(
      JSON.stringify({
        content: after.content,
        notes: after.notes,
        sceneVariants: after.sceneVariants,
      }),
    ).not.toContain('"type":"entity"');
    expect(after.relationships).toEqual([]);
    expect(after.comments).toEqual(before.comments);
    expect(after.componentFolders).toEqual(before.componentFolders);
    expect(after.props).toEqual(
      before.props.map((prop) => ({ ...prop, componentId: null })),
    );
    expect(
      validateImport(
        (await documents(page)).find((doc) => doc.id === "other-document"),
      ),
    ).toEqual(validateImport(other));
    expect(await savedLibrary(page)).toEqual(library);
    await page.screenshot({
      path: info.outputPath("clear-components-after.png"),
    });
    await dialog
      .getByRole("button", {
        name: en ? "Undo clearing" : "Отменить очистку",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await stored(page)).components)
      .toEqual(before.components);
    after = await stored(page);
    for (const key of [
      "notes",
      "sceneVariants",
      "relationships",
      "graphLayout",
      "props",
    ])
      expect(after[key]).toEqual(before[key]);
    await page.keyboard.press("Control+y");
    await expect
      .poll(async () => (await stored(page)).components.length)
      .toBe(0);
    await page.keyboard.press("Control+z");
    await expect
      .poll(async () => (await stored(page)).components.length)
      .toBe(3);
    await clear.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await stored(page)).components.length)
      .toBe(0);
    await dialog
      .getByRole("button", { name: en ? "Close" : "Закрыть", exact: true })
      .click();
    await expect(
      page.locator(".screenplay-editor [data-entity-id]"),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".screenplay-editor")).toBeVisible();
    expect((await stored(page)).components).toEqual([]);
    expect(text(await stored(page))).toBe(text(before));
    dialog = await openLibrary(page, settings.language);
    await expect(
      dialog.getByRole("button", {
        name: en ? "Clear components" : "Очистить компоненты",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .locator(".library-list button")
      .filter({ hasText: "Сохранённая библиотека" })
      .click();
    await expect(dialog.locator(".library-components")).toContainText(
      "Комната",
    );
    expect(await savedLibrary(page)).toEqual(library);
  });

test.describe("touch bulk component clearing", () => {
  test.use({ hasTouch: true });
  test("320px: clear and undo are reachable by touch without overflowing the library dialog", async ({
    page,
  }, info) => {
    await open(page, { mobile: true });
    const dialog = await openLibrary(page, "ru", true);
    const clear = dialog.getByRole("button", {
      name: "Очистить компоненты",
      exact: true,
    });
    const box = await clear.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    await clear.tap();
    await expect
      .poll(async () => (await stored(page)).components.length)
      .toBe(0);
    await expect(dialog.getByRole("status")).toBeVisible();
    await page.screenshot({
      path: info.outputPath("clear-components-mobile.png"),
    });
    await dialog
      .getByRole("button", { name: "Отменить очистку", exact: true })
      .tap();
    await expect
      .poll(async () => (await stored(page)).components.length)
      .toBe(3);
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  });
});

test("an empty document has a disabled clear action and no undo action", async ({
  page,
}) => {
  await open(page, { empty: true });
  const dialog = await openLibrary(page);
  await expect(
    dialog.getByRole("button", { name: "Очистить компоненты", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Отменить очистку", exact: true }),
  ).toHaveCount(0);
});
