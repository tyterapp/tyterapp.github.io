import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const fixture = () => {
  const project = createProject("Миниатюры и история");
  project.id = "sidebars-test";
  project.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "scene-1" },
      content: [{ type: "text", text: "ИНТ. ДОМ — ДЕНЬ" }],
    },
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "action-1" },
      content: [{ type: "text", text: "Кошка смотрит в окно." }],
    },
  ];
  project.components = [
    { id: "cat", name: "Кошка", type: "character", color: "#1b2eff" },
  ];
  project.props = [
    { id: "window", name: "окно", quantity: 2, category: "Objects" },
  ];
  project.outline = {
    columns: [
      { id: "act-1", title: "Начало" },
      { id: "act-2", title: "Финал" },
    ],
    cards: [
      {
        id: "card-1",
        columnId: "act-1",
        title: "Знакомство",
        text: "Мир героя",
        drama: 0,
        blockId: "scene-1",
        comments: [],
      },
      {
        id: "card-2",
        columnId: "act-2",
        title: "Возвращение",
        text: "Развязка",
        drama: 10,
        comments: [],
      },
    ],
  };
  return project;
};
async function open(page, project = fixture()) {
  await grantPro(page);
  await page.addInitScript((project) => {
    if (sessionStorage.getItem("sidebar-seeded")) return;
    localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
    localStorage.setItem("tyter.active", project.id);
    sessionStorage.setItem("sidebar-seeded", "true");
  }, project);
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect.poll(async () => !!(await stored(page))).toBe(true);
}
const stored = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents.find(
      (doc) => doc.id === "sidebars-test",
    );
  });
const revisions = (page) =>
  page.evaluate(async () => {
    const { listRevisions } = await import("/src/history.js");
    return listRevisions("sidebars-test", Infinity);
  });

test("left tools open left sidebars and disappear completely in outline", async ({
  page,
}, info) => {
  await open(page);
  const tools = page.getByRole("navigation", { name: "Инструменты сценария" });
  expect((await tools.boundingBox()).x).toBe(0);
  for (const [button, drawer] of [
    ["Поиск по сценарию", "Поиск по сценарию"],
    ["Статистика документа", "Статистика документа"],
    ["Компоненты", "Компоненты сценария"],
    ["Реквизит", "Реквизит сценария"],
  ]) {
    await tools.getByRole("button", { name: button, exact: true }).click();
    const sidebar = page.getByRole("complementary", {
      name: drawer,
      exact: true,
    });
    await expect(sidebar).toBeVisible();
    const bounds = await sidebar.boundingBox();
    const editor = await page.locator(".editor-column").boundingBox();
    const rail = await tools.boundingBox();
    expect(bounds.x).toBeCloseTo(rail.x + rail.width, 0);
    expect(bounds.x + bounds.width).toBeCloseTo(editor.x, 0);
  }
  await page.screenshot({ path: info.outputPath("left-sidebar.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page
    .getByRole("complementary", { name: "Реквизит сценария" })
    .boundingBox();
  expect(mobile.x).toBe(64);
  expect(mobile.x + mobile.width).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await expect(tools).toHaveCount(0);
  for (const name of [
    "Поиск по сценарию",
    "Статистика документа",
    "Компоненты",
    "Реквизит",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await expect(tools).toBeVisible();
});

test("graph targets cover full height, adapt from 32 to 88 pixels and select far from the point", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page
    .getByRole("button", { name: "График драматичности", exact: true })
    .click();
  const graph = page.getByRole("complementary", {
    name: "График драматичности",
    exact: true,
  });
  const target = graph
    .getByRole("button", { name: "Знакомство: драматичность 0 из 10" })
    .locator(".drama-hit-area");
  const box = await target.boundingBox();
  expect(box.width).toBe(88);
  const svg = await graph
    .getByRole("group", { name: "Драматичность по актам" })
    .boundingBox();
  expect(box.height).toBe(svg.height);
  await page.mouse.click(box.x + box.width / 2, box.y + 20);
  await expect(page.getByLabel("Название карточки")).toHaveValue("Знакомство");
  await expect(graph.locator('[aria-pressed="true"]')).toHaveAttribute(
    "aria-label",
    "Знакомство: драматичность 0 из 10",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => (await target.boundingBox()).width)
    .toBeLessThan(88);
  await expect
    .poll(async () => {
      const bounds = await target.boundingBox();
      const height = await graph
        .locator(".outline-drama-scroll")
        .evaluate((node) => node.clientHeight);
      return Math.abs(bounds.height - height);
    })
    .toBeLessThanOrEqual(1);
  const narrow = await target.boundingBox();
  expect(narrow.width).toBeGreaterThanOrEqual(32);
  expect(narrow.width).toBeLessThan(88);
  const next = await graph
    .getByRole("button", { name: "Возвращение: драматичность 10 из 10" })
    .locator(".drama-hit-area")
    .boundingBox();
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(next.x + 1);
  await graph
    .getByRole("button", { name: "Возвращение: драматичность 10 из 10" })
    .locator(".drama-hit-area")
    .click({ position: { x: next.width / 2, y: next.height - 20 } });
  await expect(page.getByLabel("Название карточки")).toHaveValue("Возвращение");
});

test("component and prop thumbnails persist in TYT and preview only on mouse hover", async ({
  page,
}, info) => {
  await open(page);
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#85b9ef";
    ctx.fillRect(0, 0, 120, 80);
    ctx.fillStyle = "#f4bd58";
    ctx.fillRect(40, 20, 40, 40);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  for (const [button, drawer, row] of [
    ["Компоненты", "Компоненты сценария", '[data-component-preview="cat"]'],
    ["Реквизит", "Реквизит сценария", '[data-prop-preview="window"]'],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    const sidebar = page.getByRole("complementary", { name: drawer });
    await sidebar.locator(row).click();
    await sidebar.getByLabel("Файл миниатюры").setInputFiles({
      name: "thumb.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
    await expect(sidebar.locator(".thumbnail-field-image")).toBeVisible();
    await sidebar
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(sidebar.locator(`${row} img`)).toBeVisible();
    await sidebar.locator(`${row} img`).hover();
    await expect(page.locator(".thumbnail-preview img")).toBeVisible();
    await page.mouse.move(700, 80);
    await expect(page.locator(".thumbnail-preview")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Закрыть реквизит" }).click();
  await expect(page.locator(".screenplay-editor img")).toHaveCount(0);
  for (const selector of [
    '.screenplay-editor [data-entity-id="cat"]',
    '.screenplay-editor [data-prop-id="window"]',
  ]) {
    const word = page.locator(selector).first();
    await word.dispatchEvent("pointerover", { pointerType: "touch" });
    await page.waitForTimeout(300);
    await expect(page.locator(".thumbnail-preview")).toHaveCount(0);
    await word.focus();
    await page.waitForTimeout(300);
    await expect(page.locator(".thumbnail-preview")).toHaveCount(0);
    await word.hover();
    await expect(page.locator(".thumbnail-preview img")).toBeVisible();
    await page.mouse.move(700, 80);
  }
  await page
    .locator('.screenplay-editor [data-entity-id="cat"]')
    .first()
    .hover();
  await expect(page.locator(".thumbnail-preview img")).toBeVisible();
  await page.screenshot({ path: info.outputPath("thumbnail-preview.png") });
  const payload = await page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const doc = (await browserRequest("documents")).documents.find(
      (d) => d.id === "sidebars-test",
    );
    return readTYT(await (await exportTYT(doc)).text());
  });
  expect(payload.components[0].thumbnail).toMatch(/^data:image\/jpeg;base64,/);
  expect(payload.props[0].thumbnail).toMatch(/^data:image\/jpeg;base64,/);
  await page.reload();
  await expect
    .poll(async () => !!(await stored(page))?.components[0].thumbnail)
    .toBe(true);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  const sidebar = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await expect(
    sidebar.locator('[data-component-preview="cat"] img'),
  ).toBeVisible();
  await sidebar.locator('[data-component-preview="cat"]').click();
  await sidebar.getByRole("button", { name: "Удалить миниатюру" }).click();
  await sidebar.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    sidebar.locator('[data-component-preview="cat"] img'),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await stored(page)).components[0].thumbnail)
    .toBeNull();
});

test("outline history includes card edits, previews old cards and restores without reverting screenplay", async ({
  page,
}, info) => {
  await open(page);
  const action = page.locator('.screenplay-editor [data-block-id="action-1"]');
  await action.click();
  await page.keyboard.press("Home");
  await page.keyboard.type("Новая версия. ");
  await expect(action).toContainText("Новая версия.");
  await expect
    .poll(async () =>
      (await stored(page)).content.content[1].content
        .map((part) => part.text)
        .join(""),
    )
    .toContain("Новая версия.");
  await expect
    .poll(
      async () =>
        (await revisions(page)).filter((r) => r.area === "screenplay").length,
    )
    .toBe(1);
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page.getByRole("button", { name: "Знакомство", exact: true }).click();
  await page.getByLabel("Название карточки").fill("Новая карточка");
  await page
    .getByLabel("Текст карточки", { exact: true })
    .fill("Новый сюжет карточки");
  await page.getByLabel("Драматичность карточки", { exact: true }).fill("8");
  await page
    .getByLabel("Комментарий карточки", { exact: true })
    .fill("Новый комментарий");
  await page
    .getByRole("button", { name: "Добавить комментарий карточки", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page)).outline.cards[0].drama)
    .toBe(8);
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  const history = page.getByRole("complementary", {
    name: "История изменений",
    exact: true,
  });
  await expect(
    history.getByRole("tab", { name: "Аутлайн", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(history.locator(".history-card")).toHaveCount(1);
  await history.locator(".history-card").first().click();
  const preview = page.getByLabel("Аутлайн выбранной версии");
  await expect(preview).toContainText("Знакомство");
  await expect(preview).toContainText("Мир героя");
  await expect(preview).not.toContainText("Новый сюжет карточки");
  await page.screenshot({ path: info.outputPath("outline-history.png") });
  await history
    .getByRole("button", { name: "Восстановить эту версию" })
    .click();
  await expect(preview).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Знакомство", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await stored(page)).outline.cards[0].drama)
    .toBe(0);
  await expect
    .poll(async () => (await stored(page)).outline.cards[0].comments.length)
    .toBe(0);
  expect(
    (await stored(page)).content.content[1].content
      .map((part) => part.text)
      .join(""),
  ).toContain("Новая версия.");
  await history.getByRole("tab", { name: "Сценарий", exact: true }).click();
  await expect(history.locator(".history-card")).toHaveCount(1);
  await history.locator(".history-card").first().click();
  await expect(page.getByLabel("Текст выбранной версии")).not.toContainText(
    "Новая версия.",
  );
  await history
    .getByRole("button", { name: "Восстановить эту версию" })
    .click();
  await expect(action).not.toContainText("Новая версия.");
  await expect
    .poll(async () =>
      (await stored(page)).content.content[1].content
        .map((part) => part.text)
        .join(""),
    )
    .not.toContain("Новая версия.");
  expect((await stored(page)).outline.cards[0].title).toBe("Знакомство");
  const imported = await page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const doc = (await browserRequest("documents")).documents.find(
      (d) => d.id === "sidebars-test",
    );
    return readTYT(await (await exportTYT(doc)).text()).importedHistory.map(
      (entry) => entry.area,
    );
  });
  expect(imported).toContain("outline");
  expect(imported).toContain("screenplay");
  await page.reload();
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  await history.getByRole("tab", { name: "Аутлайн", exact: true }).click();
  await expect(history.locator(".history-card")).toHaveCount(2);
});
