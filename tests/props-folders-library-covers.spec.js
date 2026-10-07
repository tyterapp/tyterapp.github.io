import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const fixture = {
  ...createProject("История лампы"),
  id: "folders-cover-test",
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { format: "scene", blockId: "scene" },
        content: [{ type: "text", text: "ИНТ. ДОМ — ДЕНЬ" }],
      },
      {
        type: "paragraph",
        attrs: { format: "action", blockId: "action" },
        content: [{ type: "text", text: "Анна включает лампу." }],
      },
    ],
  },
  components: [
    {
      id: "anna",
      name: "Анна",
      type: "character",
      description:
        "Первая строка\nВторая строка\nТретья строка\nЧетвёртая строка\nПятая строка\nШестая строка",
      thumbnail: null,
    },
  ],
  props: [
    {
      id: "lamp",
      name: "лампу",
      quantity: 1,
      category: "Objects",
      folderId: null,
      description: "",
      thumbnail: null,
    },
  ],
};
test.beforeEach(async ({ page }) => {
  await grantPro(page);
  await page.addInitScript((doc) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
  }, fixture);
});
const stored = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents.find(
      (doc) => doc.id === "folders-cover-test",
    );
  });

test("props can move into folders, collapse, survive TYT and return to Unfiled when a folder is deleted", async ({
  page,
}, info) => {
  await page.goto("/pro");
  await page.getByRole("button", { name: "Реквизит", exact: true }).click();
  const sidebar = page.getByRole("complementary", {
    name: "Реквизит сценария",
  });
  await sidebar
    .getByRole("button", { name: "Создать папку реквизита" })
    .click();
  await sidebar.getByLabel("Название папки").fill("Освещение");
  await page.keyboard.press("Enter");
  await sidebar.locator('[data-prop-preview="lamp"]').click();
  await sidebar
    .getByLabel("Папка", { exact: true })
    .selectOption({ label: "Освещение" });
  await sidebar.getByRole("button", { name: "Сохранить", exact: true }).click();
  const group = sidebar
    .locator(".component-group")
    .filter({ has: page.getByRole("button", { name: "Папка: Освещение" }) });
  await expect(group.locator('[data-prop-preview="lamp"]')).toBeVisible();
  await group.getByRole("button", { name: "Добавить: Освещение" }).click();
  const dialog = page.getByRole("dialog", { name: "Новый реквизит" });
  await expect(
    dialog.getByLabel("Папка", { exact: true }).locator("option:checked"),
  ).toHaveText("Освещение");
  await dialog.getByLabel("Название", { exact: true }).fill("фонарь");
  await page.keyboard.press("Control+Enter");
  await expect(group.locator(".component-item")).toHaveCount(2);
  await group.getByRole("button", { name: "Папка: Освещение" }).click();
  await expect(
    group.getByRole("button", { name: "Папка: Освещение" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(async () => (await stored(page))?.collapsedPropFolders.length)
    .toBe(1);
  const payload = await page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const doc = (await browserRequest("documents")).documents[0];
    return readTYT(await (await exportTYT(doc)).text());
  });
  expect(
    payload.props.every((item) => item.folderId === payload.propFolders[0].id),
  ).toBe(true);
  expect(payload.collapsedPropFolders).toEqual([payload.propFolders[0].id]);
  await page.reload();
  await page.getByRole("button", { name: "Реквизит", exact: true }).click();
  await expect(
    sidebar.getByRole("button", { name: "Папка: Освещение" }),
  ).toHaveAttribute("aria-expanded", "false");
  await sidebar.getByRole("button", { name: "Папка: Освещение" }).click();
  await page.screenshot({ path: info.outputPath("props-folders.png") });
  await sidebar
    .getByRole("button", { name: "Удалить папку: Освещение" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Удалить папку", exact: true })
    .click();
  const unfiled = sidebar
    .locator(".component-group")
    .filter({ has: page.getByRole("button", { name: "Папка: Без папки" }) });
  await expect(unfiled.locator(".component-item")).toHaveCount(2);
  await expect
    .poll(async () => (await stored(page))?.propFolders.length)
    .toBe(0);
});

test("mouse hover shows a four-line component description without requiring an image", async ({
  page,
}, info) => {
  await page.goto("/pro");
  const word = page
    .locator('.screenplay-editor [data-entity-id="anna"]')
    .first();
  await expect(word).toBeVisible();
  await word.dispatchEvent("pointerover", { pointerType: "touch" });
  await page.waitForTimeout(300);
  await expect(page.locator(".thumbnail-preview")).toHaveCount(0);
  await word.hover();
  const description = page.locator(".thumbnail-preview .preview-description");
  await expect(description).toBeVisible();
  expect(
    await description.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        clamp: style.webkitLineClamp,
        lines: Math.round(el.clientHeight / parseFloat(style.lineHeight)),
        overflow: el.scrollHeight > el.clientHeight,
      };
    }),
  ).toEqual({ clamp: "4", lines: 4, overflow: true });
  await expect(page.locator(".thumbnail-preview img")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("component-description.png") });
  await page.mouse.move(700, 80);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await page.locator('[data-component-preview="anna"]').hover();
  await expect(description).toBeVisible();
});

test("new outline cards link one empty scene and their titles can be resized vertically", async ({
  page,
}, info) => {
  await page.goto("/pro");
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page.getByRole("button", { name: "Три акта" }).click();
  await page
    .getByRole("button", { name: "Добавить карточку в Акт 1", exact: true })
    .click();
  const title = page.getByLabel("Название карточки", { exact: true });
  await expect(title).toHaveJSProperty("tagName", "TEXTAREA");
  await title.fill(
    "Очень длинное название карточки, которое можно разместить на нескольких строках и растянуть по высоте",
  );
  const rect = await title.boundingBox();
  await page.mouse.move(rect.x + rect.width - 4, rect.y + rect.height - 4);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 4, rect.y + rect.height + 75, {
    steps: 5,
  });
  await page.mouse.up();
  expect((await title.boundingBox()).height).toBeGreaterThan(rect.height + 40);
  await expect(page.locator(".outline-card-text")).toHaveCount(0);
  await page
    .getByLabel("Текст карточки", { exact: true })
    .fill("Это текст только для карточки.");
  await page
    .getByRole("button", { name: "Перейти к сцене карточки", exact: true })
    .click();
  const scenes = page.locator('.screenplay-editor p[data-format="scene"]');
  await expect(scenes).toHaveCount(2);
  await expect(scenes.last()).toHaveText("");
  await expect(page.locator(".screenplay-editor p")).toHaveCount(3);
  await expect(page.locator(".screenplay-editor")).not.toContainText(
    "Это текст только для карточки.",
  );
  await page.screenshot({ path: info.outputPath("empty-linked-scene.png") });
});

test("PDF downloaded through the app starts with settings metadata, even without a poster", async ({
  page,
}, info) => {
  await page.goto("/pro");
  await page.getByRole("button", { name: "Настройки документа" }).click();
  await page.getByLabel("Автор", { exact: true }).fill("Иван Сценарист");
  await page.getByLabel("Год", { exact: true }).fill("2026");
  await page
    .getByLabel("Email автора", { exact: true })
    .fill("author@example.test");
  await page
    .getByRole("button", { name: "Скачать сценарий", exact: true })
    .click();
  const event = page.waitForEvent("download");
  await page.locator(".export-item").filter({ hasText: ".pdf" }).click();
  const download = await event;
  await download.saveAs(info.outputPath("settings-cover.pdf"));
  const data = await readFile(await download.path());
  const result = await page.evaluate(
    async (bytes) => {
      const pdfjs = await import("/node_modules/.vite/deps/pdfjs-dist.js");
      pdfjs.GlobalWorkerOptions.workerSrc =
        "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        isEvalSupported: false,
      });
      const pdf = await task.promise;
      const text = async (number) =>
        (await (await pdf.getPage(number)).getTextContent()).items
          .map((item) => item.str)
          .join(" ");
      const result = {
        pages: pdf.numPages,
        cover: await text(1),
        script: await text(2),
      };
      await task.destroy();
      return result;
    },
    [...data],
  );
  expect(result.pages).toBe(2);
  for (const text of [
    "История лампы",
    "Иван Сценарист",
    "2026",
    "author@example.test",
  ])
    expect(result.cover).toContain(text);
  expect(result.cover).not.toContain("ИНТ. ДОМ");
  expect(result.script.replace(/\s+/g, " ")).toContain("ИНТ. ДОМ");
});

test("changing folders replaces the library, including empty folders, and rejects stale saves", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(
        window.testFolder || "first",
        { create: true },
      );
  });
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(async () => {
    const { createProject } = await import("/src/data.js");
    const { tytPayload } = await import("/src/tyt-format.js");
    for (const [folderName, title] of [
      ["first", "В первой папке"],
      ["second", "Во второй папке"],
    ]) {
      const folder = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle(folderName, { create: true });
      const handle = await folder.getFileHandle(title + ".tyt", {
        create: true,
      });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(tytPayload(createProject(title))));
      await writable.close();
    }
  });
  await page.getByRole("button", { name: "Открыть папку сценариев" }).click();
  await expect(
    page.getByRole("button", { name: "Документы", exact: true }),
  ).toContainText("В первой папке");
  const staleTab = await context.newPage();
  await grantPro(staleTab);
  await staleTab.goto("/pro");
  await expect(
    staleTab.getByRole("button", { name: "Документы", exact: true }),
  ).toContainText("В первой папке");
  const staleDocuments = await staleTab.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents;
  });
  await page.evaluate(() => {
    window.testFolder = "second";
  });
  await page.getByRole("button", { name: "Открыть папку сценариев" }).click();
  await expect(
    page.getByRole("button", { name: "Документы", exact: true }),
  ).toContainText("Во второй папке");
  const staleError = await staleTab.evaluate(async (docs) => {
    const { saveLocalFiles } = await import("/src/local-files.js");
    try {
      await saveLocalFiles(docs);
      return null;
    } catch (error) {
      return error.message;
    }
  }, staleDocuments);
  expect(staleError).toContain("изменена в другой вкладке");
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await expect(page.locator(".document-menu .document-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.testFolder = "empty";
  });
  await page.getByRole("button", { name: "Открыть папку сценариев" }).click();
  await expect(
    page.getByText("В папке нет сценариев", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Скачать сценарий", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Аутлайн", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Компоненты", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("В папке нет сценариев", { exact: true }),
  ).toBeVisible();
  const folders = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const result = {};
    for (const name of ["first", "second", "empty"]) {
      result[name] = [];
      for await (const handle of (await root.getDirectoryHandle(name)).values())
        result[name].push(handle.name);
    }
    return result;
  });
  expect(folders).toEqual({
    first: ["В первой папке.tyt"],
    second: ["Во второй папке.tyt"],
    empty: [],
  });
});
