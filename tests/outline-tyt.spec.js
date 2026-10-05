import { test, expect } from "@playwright/test";
import { grantPro } from "./helpers/pro-access.js";

const fixture = {
  id: "outline-test",
  title: "История из окна",
  updatedAt: new Date().toISOString(),
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
        content: [
          {
            type: "text",
            text: "Кошка смотрит в окно.",
            marks: [
              { type: "entity", attrs: { id: "cat", color: "#1b2eff" } },
              { type: "comment", attrs: { id: "comment" } },
            ],
          },
        ],
      },
    ],
  },
  components: [
    {
      id: "cat",
      name: "Кошка",
      type: "character",
      folderId: "animals",
      description: "Главная героиня",
      color: "#1b2eff",
    },
  ],
  componentFolders: [{ id: "animals", name: "Животные" }],
  collapsedComponentFolders: ["animals"],
  props: [
    {
      id: "window",
      name: "окно",
      quantity: 2,
      category: "Objects",
      description: "Окно комнаты",
      blockId: "action",
    },
  ],
  comments: [
    {
      id: "comment",
      text: "Проверить свет",
      quote: "Кошка смотрит в окно.",
      blockId: "action",
      resolved: true,
      author: "Автор",
      createdAt: "2026-09-01T10:00:00.000Z",
      anchor: 24,
    },
  ],
  metadata: {
    author: "Автор истории",
    email: "author@example.com",
    year: "2026",
    fontFamily: "georgia",
    fontSize: 18,
    formatBarMode: "icons",
  },
  outline: { columns: [], cards: [] },
};
test.beforeEach(async ({ page }) => {
  await grantPro(page);
  await page.addInitScript((document) => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
    localStorage.setItem("tyter.active", document.id);
  }, fixture);
});
const stored = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents;
  });
test("outline cards create independent scenes and navigate in both directions", async ({
  page,
}, info) => {
  await page.goto("/pro");
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Компоненты", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Реквизит", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Статистика документа" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Три акта" }).click();
  await page
    .getByRole("button", { name: "Добавить карточку в Акт 1", exact: true })
    .click();
  await page.getByLabel("Название карточки").fill("Окно");
  await page
    .getByLabel("Текст карточки", { exact: true })
    .fill("Карточка: кошка замечает свет в окне.");
  await page.getByRole("button", { name: "Синий", exact: true }).click();
  await page
    .getByLabel("Комментарий карточки", { exact: true })
    .fill("Важная часть истории");
  await page
    .getByRole("button", { name: "Добавить комментарий карточки" })
    .click();
  await page.getByRole("button", { name: "Перейти к сцене карточки" }).click();
  const scene = page
    .locator('.screenplay-editor p[data-format="scene"]')
    .last();
  await expect(scene).toContainText("НОВАЯ СЦЕНА");
  await scene.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.insertText("ИНТ. РЕДАКЦИЯ — ДЕНЬ");
  await page
    .getByRole("button", { name: "Открыть карточку Окно", exact: true })
    .click();
  await expect(page.getByLabel("Название карточки")).toHaveValue("Окно");
  await expect(page.getByLabel("Текст карточки", { exact: true })).toHaveValue(
    "Карточка: кошка замечает свет в окне.",
  );
  await expect(page.locator(".outline-comment")).toContainText(
    "Важная часть истории",
  );
  await page.keyboard.press("Control+f");
  await expect(
    page.getByLabel("Поиск карточек", { exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Поиск карточек", { exact: true })
    .fill("нет такой карточки");
  await expect(page.locator(".outline-card")).toHaveCount(0);
  await page.getByLabel("Поиск карточек", { exact: true }).fill("окно");
  await expect(page.locator(".outline-card")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("outline.png") });
  await page.getByRole("button", { name: "Действия с карточкой Окно" }).click();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Удалить из аутлайна" })
    .getByRole("button", { name: "Удалить", exact: true })
    .click();
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await expect(scene).toContainText("РЕДАКЦИЯ");
  await expect(page.locator(".outline-scene-link")).toHaveCount(0);
});
test("TYT round trip preserves comments, props, components, folders, metadata, outline and history", async ({
  page,
}) => {
  await page.goto("/pro");
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page.getByRole("button", { name: "Добавить акт" }).click();
  await page.getByRole("button", { name: "Добавить карточку в Акт 1" }).click();
  await page.getByLabel("Название карточки").fill("Свет в окне");
  await page.getByLabel("Драматичность карточки", { exact: true }).fill("7");
  await page
    .getByLabel("Текст карточки", { exact: true })
    .fill("Независимый текст карточки.");
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await expect
    .poll(async () => (await stored(page))[0]?.outline?.cards?.[0]?.title)
    .toBe("Свет в окне");
  await page.getByRole("button", { name: "Скачать сценарий" }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: /Проект Tyter · TYT/ }).click();
  const download = await event;
  const stream = await download.createReadStream();
  const parts = [];
  for await (const part of stream) parts.push(part);
  const buffer = Buffer.concat(parts);
  const payload = JSON.parse(buffer.toString("utf8"));
  expect(payload.format).toBe("tyter");
  expect(payload.document.comments[0]).toMatchObject(fixture.comments[0]);
  expect(payload.document.props[0]).toMatchObject(fixture.props[0]);
  expect(payload.document.components[0]).toMatchObject(fixture.components[0]);
  expect(payload.document.metadata).toMatchObject(fixture.metadata);
  expect(payload.document.outline.cards[0].title).toBe("Свет в окне");
  expect(payload.document.outline.cards[0].drama).toBe(7);
  expect(payload.history.length).toBeGreaterThan(0);
  await page.locator('input[type="file"][accept*=".tyt"]').setInputFiles({
    name: "backup.tyt",
    mimeType: "application/vnd.tyter+json",
    buffer,
  });
  await expect.poll(async () => (await stored(page)).length).toBe(2);
  const restored = (await stored(page)).find(
    (document) => document.id !== fixture.id,
  );
  expect(restored.content).toEqual(payload.document.content);
  expect(restored.outline).toEqual(payload.document.outline);
  expect(restored.comments).toEqual(payload.document.comments);
  expect(restored.componentFolders).toEqual(payload.document.componentFolders);
  expect(
    await page.evaluate(async (id) => {
      const { listRevisions } = await import("/src/history.js");
      return (await listRevisions(id, Infinity)).map((item) => item.createdAt);
    }, restored.id),
  ).toContain(payload.history[0].createdAt);
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect.poll(async () => (await stored(page)).length).toBe(2);
  expect(
    (await stored(page)).find((document) => document.id === restored.id)
      .outline,
  ).toEqual(restored.outline);
});
test("a partial title page is exported and scene numbers center on the heading line", async ({
  page,
}) => {
  await page.goto("/pro");
  const result = await page.evaluate(async () => {
    const { exportPDF, exportDOCX, hasTitlePage } =
      await import("/src/exports.js");
    const { createProject } = await import("/src/data.js");
    const document = createProject("Титульная страница");
    document.metadata.author = "Автор без email";
    const pdfjs = await import("/node_modules/.vite/deps/pdfjs-dist.js");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "/node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({
      data: new Uint8Array(await (await exportPDF(document)).arrayBuffer()),
      isEvalSupported: false,
    });
    const pdf = await task.promise;
    const titleText = (await (await pdf.getPage(1)).getTextContent()).items
      .map((item) => item.str)
      .join(" ");
    const pages = pdf.numPages;
    await task.destroy();
    return {
      titleText,
      pages,
      enabled: hasTitlePage(document),
      docxBytes: (await exportDOCX(document)).size,
    };
  });
  expect(result.enabled).toBe(true);
  expect(result.pages).toBeGreaterThan(1);
  expect(result.titleText).toContain("Титульная страница");
  expect(result.titleText).toContain("Автор без email");
  expect(result.titleText).not.toContain("undefined");
  const metrics = await page
    .locator('.screenplay-editor p[data-format="scene"]')
    .first()
    .evaluate((element) => {
      const paragraph = getComputedStyle(element);
      const number = element
        .querySelector(".scene-number")
        .getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return {
        center: (number.top + number.bottom) / 2 - rect.top,
        line: parseFloat(paragraph.lineHeight),
        padding: parseFloat(paragraph.paddingTop),
      };
    });
  expect(
    Math.abs(metrics.center - metrics.padding - metrics.line / 2),
  ).toBeLessThan(1);
});
