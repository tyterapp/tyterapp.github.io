import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import {
  switchScriptVersion,
  scriptVersionSnapshot,
  removeScriptVersion,
  restoreScriptVersion,
  isScriptVersionCopy,
} from "../src/script-versions.js";
import { grantPro } from "./helpers/pro-access.js";

const wallet = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("tyter.writing-timer.v1")),
  );

const block = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
function fixture(active = "white") {
  let doc = createProject("Удаление копий");
  doc.id = "version-deletion";
  doc.content.content = [
    block("scene", "ИНТ. ДОМ — ДЕНЬ", "scene"),
    block("action", "Белый текст.", "action"),
  ];
  doc = switchScriptVersion(doc, "blue");
  doc.content.content[1] = block("action", "Синий текст.", "action");
  doc.sceneShots = { scene: { A: { name: "Синий кадр", people: "2" } } };
  doc.components = [{ id: "hero", name: "ГЕРОЙ", type: "character" }];
  doc.outline = {
    columns: [{ id: "act", title: "Акт 1" }],
    cards: [
      {
        id: "card",
        columnId: "act",
        title: "Синяя карточка",
        text: "Текст",
        comments: [],
      },
    ],
  };
  doc = switchScriptVersion(doc, "pink");
  doc.content.content[1] = block("action", "Розовый текст.", "action");
  doc = switchScriptVersion(doc, active);
  return doc;
}
const picker = (page) =>
  page.getByRole("combobox", { name: "Версии сценария", exact: true });
const blueDelete = (page) =>
  page.getByRole("button", { name: "Удалить копию v2 Blue", exact: true });
const notice = (page) => page.locator(".version-deletion-message");
async function open(
  page,
  { theme = "light", width = 1440, active = "white" } = {},
) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("version-deletion-seeded")) return;
      sessionStorage.setItem("version-deletion-seeded", "yes");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc: fixture(active), theme },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
async function freeze(page) {
  // Keep the clock after the fixture's timestamp: the shared file store rejects older snapshots.
  const now = await page.evaluate(() => Date.now());
  await page.clock.install({ time: new Date(now + 1000) });
  await page.clock.pauseAt(new Date(now + 2000));
}
async function choose(page, id) {
  await picker(page).click();
  await page.locator(`[role="option"][data-value="${id}"]`).click();
  await page.clock.runFor(300);
}
async function stored(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("tyter.local-files.v1", 1);
        open.onsuccess = () => {
          const db = open.result,
            request = db
              .transaction("files")
              .objectStore("files")
              .get("documents");
          request.onsuccess = () => {
            resolve(
              request.result?.find((doc) => doc.id === "version-deletion"),
            );
            db.close();
          };
        };
      }),
  );
}
async function appendWhite(page) {
  await page.locator('p[data-block-id="action"]').click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Новое изменение.");
  await expect(page.locator('p[data-block-id="action"]')).toContainText(
    "Новое изменение.",
  );
}

test("removing and restoring a copy preserves other versions and all copy fields, and protects the original", () => {
  const original = fixture("blue"),
    snapshot = scriptVersionSnapshot(original);
  expect(isScriptVersionCopy(original, "white")).toBe(false);
  expect(removeScriptVersion(original, "white")).toBeNull();
  expect(removeScriptVersion(original, "cherry")).toBeNull();
  const deleted = removeScriptVersion(original, "blue");
  expect(deleted.document.scriptVersion).toBe("white");
  expect(deleted.document.scriptVersions.blue).toBeUndefined();
  expect(deleted.snapshot).toEqual(snapshot);
  const edited = structuredClone(deleted.document);
  edited.content.content[1].content[0].text = "Изменение после удаления.";
  const restored = restoreScriptVersion(edited, "blue", deleted.snapshot, {
    activate: true,
  });
  expect(scriptVersionSnapshot(restored)).toEqual(snapshot);
  expect(restored.scriptVersions.white.content.content[1].content[0].text).toBe(
    "Изменение после удаления.",
  );
  expect(validateImport(restored).sceneShots).toEqual(original.sceneShots);
  expect(restoreScriptVersion(restored, "blue", snapshot)).toBe(restored);
  expect(deleted.document.scriptVersions.pink).toEqual(
    original.scriptVersions.pink,
  );
});

for (const theme of ["light", "dark"])
  test(`${theme}: created copies show a red delete action and undo restores the copy without losing current edits`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    await freeze(page);
    await picker(page).click();
    await expect(
      page.getByRole("button", { name: "Удалить копию v1 White", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Удалить копию v9 Cherry",
        exact: true,
      }),
    ).toHaveCount(0);
    await blueDelete(page).hover();
    await page.clock.runFor(200);
    await expect
      .poll(async () =>
        blueDelete(page).evaluate((button) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = getComputedStyle(button).color;
          ctx.fillRect(0, 0, 1, 1);
          const rgb = ctx.getImageData(0, 0, 1, 1).data;
          return rgb[0] - rgb[1];
        }),
      )
      .toBeGreaterThan(30);
    await page.screenshot({ path: info.outputPath("copy-delete-hover.png") });
    await blueDelete(page).click();
    await expect(picker(page)).toContainText("v1 White");
    await expect(notice(page)).toContainText("v2 Blue");
    await expect(
      notice(page).getByRole("button", {
        name: "Отменить удаление",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(notice(page).locator(".lucide-download")).toBeVisible();
    await appendWhite(page);
    await page.clock.runFor(14000);
    await expect(
      notice(page).getByRole("button", {
        name: "Отменить удаление",
        exact: true,
      }),
    ).toBeEnabled();
    await page.screenshot({ path: info.outputPath("undo-copy-deletion.png") });
    await notice(page)
      .getByRole("button", { name: "Отменить удаление", exact: true })
      .click();
    await expect(notice(page)).toHaveCount(0);
    await expect(page.locator('p[data-block-id="action"]')).toHaveText(
      "Белый текст. Новое изменение.",
    );
    await page.clock.runFor(400);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("tyter:save-now")),
    );
    await expect
      .poll(
        async () =>
          (await stored(page))?.scriptVersions?.blue?.sceneShots?.scene?.A
            ?.name,
      )
      .toBe("Синий кадр");
    await choose(page, "blue");
    await expect(page.locator('p[data-block-id="action"]')).toHaveText(
      "Синий текст.",
    );
  });

test("deleting the active copy switches to White and undo preserves edits made there", async ({
  page,
}) => {
  await open(page, { active: "blue" });
  await freeze(page);
  await picker(page).click();
  await blueDelete(page).click();
  await page.clock.runFor(300);
  await expect(picker(page)).toContainText("v1 White");
  await appendWhite(page);
  await notice(page)
    .getByRole("button", { name: "Отменить удаление", exact: true })
    .click();
  await page.clock.runFor(300);
  await expect(picker(page)).toContainText("v2 Blue");
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Синий текст.",
  );
  await choose(page, "white");
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Белый текст. Новое изменение.",
  );
});

test("the close button confirms deletion immediately and the slot can create a new copy", async ({
  page,
}) => {
  await open(page);
  await freeze(page);
  await picker(page).click();
  await blueDelete(page).click();
  await notice(page)
    .getByRole("button", { name: "Подтвердить удаление копии", exact: true })
    .click();
  await page.clock.runFor(201);
  await expect(notice(page)).toHaveCount(0);
  await picker(page).click();
  await expect(blueDelete(page)).toHaveCount(0);
  await expect(
    page.locator('[role="option"][data-value="blue"]'),
  ).toContainText("Создать копию");
  await page.locator('[role="option"][data-value="blue"]').click();
  await expect(picker(page)).toContainText("v2 Blue");
  await page.clock.runFor(400);
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Белый текст.",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("tyter:save-now")));
  await expect
    .poll(async () => (await stored(page))?.scriptVersion)
    .toBe("blue");
});

test("undo lasts 15 seconds, then the copy and its history are removed", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("tyter.history.v1", 1);
        open.onupgradeneeded = () => {
          const store = open.result.createObjectStore("revisions", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("documentId", "documentId");
        };
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction("revisions", "readwrite");
          for (const [documentId, version, area, label] of [
            ["version-deletion", "blue", "screenplay", "Синяя история"],
            ["version-deletion", "blue", "outline", "Синий аутлайн"],
            ["version-deletion", "white", "screenplay", "Белая история"],
            ["version-deletion", "blue", "notes", "Общие заметки"],
            ["version-deletion", "blue", undefined, "Изменение заметок"],
            [
              "version-deletion::script::blue",
              "blue",
              "screenplay",
              "Старая синяя история",
            ],
          ])
            tx.objectStore("revisions").add({
              documentId,
              createdAt: Date.now(),
              area,
              label,
              snapshot: { scriptVersion: version },
            });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
  );
  await freeze(page);
  await picker(page).click();
  await blueDelete(page).click();
  await page.clock.runFor(14999);
  await expect(
    notice(page).getByRole("button", {
      name: "Отменить удаление",
      exact: true,
    }),
  ).toBeEnabled();
  await page.clock.runFor(1);
  await expect(
    notice(page).getByRole("button", {
      name: "Отменить удаление",
      exact: true,
    }),
  ).toBeDisabled();
  await page.clock.runFor(201);
  await expect(notice(page)).toHaveCount(0);
  await expect
    .poll(async () => (await stored(page))?.scriptVersions?.blue)
    .toBeUndefined();
  const history = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open("tyter.history.v1", 1);
        open.onsuccess = () => {
          const db = open.result,
            request = db
              .transaction("revisions")
              .objectStore("revisions")
              .index("documentId")
              .getAll();
          request.onsuccess = () => {
            resolve(request.result);
            db.close();
          };
        };
      }),
  );
  expect(history.map((row) => row.label).sort()).toEqual(
    ["Белая история", "Изменение заметок", "Общие заметки"].sort(),
  );
});

test("320px: copy deletion has touch controls and the warning fits the screen", async ({
  page,
}, info) => {
  await open(page, { width: 320, theme: "dark" });
  await freeze(page);
  await picker(page).click();
  const button = await blueDelete(page).boundingBox();
  expect(button.width).toBeGreaterThanOrEqual(44);
  expect(button.height).toBeGreaterThanOrEqual(44);
  await blueDelete(page).click();
  const rect = await notice(page).boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: info.outputPath("mobile-copy-deletion.png") });
  await notice(page)
    .getByRole("button", { name: "Отменить удаление", exact: true })
    .click();
  await expect(notice(page)).toHaveCount(0);
});

test("only confirmed deletions enter today's history; deleting the last copy awards Scavenger once", async ({
  page,
}) => {
  await open(page);
  await freeze(page);
  const balance = (await wallet(page)).coins;
  await picker(page).click();
  await blueDelete(page).click();
  await notice(page)
    .getByRole("button", { name: "Отменить удаление", exact: true })
    .click();
  await page.clock.runFor(300);
  expect((await wallet(page)).deletions || []).toHaveLength(0);
  const remove = async (name) => {
    await picker(page).click();
    await page
      .getByRole("button", { name: `Удалить копию ${name}`, exact: true })
      .click();
    await notice(page)
      .getByRole("button", { name: "Подтвердить удаление копии", exact: true })
      .click();
    await page.clock.runFor(300);
    await expect(notice(page)).toHaveCount(0);
  };
  await remove("v2 Blue");
  await expect.poll(async () => (await wallet(page)).deletions?.length).toBe(1);
  expect((await wallet(page)).coins).toBe(balance);
  expect((await wallet(page)).achievements?.scavenger).toBeUndefined();
  await remove("v3 Pink");
  await expect.poll(async () => (await wallet(page)).coins).toBe(balance + 10);
  expect((await wallet(page)).deletions).toHaveLength(2);
  expect((await wallet(page)).achievements.scavenger.reward).toBe(10);
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  const journal = page.locator(".history-deletions");
  const disclosure = journal.getByRole("button", {
    name: /Удалённые копии за сегодня/,
  });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(journal.locator(".history-achievement")).toBeHidden();
  await expect(journal.locator("ul")).toBeHidden();
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(journal.locator(".history-achievement")).toBeVisible();
  await expect(journal).toContainText("Ачивка «Мусорщик»");
  await expect(journal.locator("li")).toHaveCount(2);
  await expect(journal).toContainText("v2 Blue");
  await expect(journal).toContainText("v3 Pink");
  await disclosure.click();
  await expect(journal.locator("ul")).toBeHidden();
  await page
    .getByRole("button", { name: "Закрыть историю", exact: true })
    .click();
  await choose(page, "blue");
  await remove("v2 Blue");
  await expect.poll(async () => (await wallet(page)).deletions?.length).toBe(3);
  expect((await wallet(page)).coins).toBe(balance + 10);
});
