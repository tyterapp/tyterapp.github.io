import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro, codesRoute, listResponse } from "./helpers/pro-access.js";

function fixture() {
  const project = createProject("Русское название");
  project.id = "language-outline-controls";
  project.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "scene" },
      content: [{ type: "text", text: "ИНТ. ДОМ — ДЕНЬ" }],
    },
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "text" },
      content: [{ type: "text", text: "Анна берёт ключи." }],
    },
  ];
  project.components = [
    {
      id: "anna",
      name: "Анна",
      type: "character",
      color: "#1b2eff",
      description: "Персонажи",
    },
  ];
  project.props = [
    { id: "keys", name: "ключи", quantity: 2, description: "Компоненты" },
  ];
  project.outline = {
    columns: [
      { id: "act", title: "Начало" },
      { id: "act-2", title: "Финал" },
    ],
    cards: [
      {
        id: "card",
        columnId: "act",
        title: "Завязка",
        text: "Русский текст карточки",
        color: "#f06c43",
        drama: 3,
        blockId: "scene",
        comments: [],
      },
      {
        id: "card-2",
        columnId: "act-2",
        title: "Развязка",
        text: "Другой текст",
        color: "#1b2eff",
        drama: 8,
        comments: [],
      },
    ],
  };
  return project;
}
async function open(page) {
  await grantPro(page);
  await page.addInitScript((project) => {
    if (sessionStorage.getItem("language-controls-seeded")) return;
    localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
    localStorage.setItem("tyter.active", project.id);
    sessionStorage.setItem("language-controls-seeded", "true");
  }, fixture());
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
const stored = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents.find(
      (doc) => doc.id === "language-outline-controls",
    );
  });
const mode = (page, name) =>
  page
    .locator(".document-view-toggle")
    .getByRole("button", { name, exact: true });

test("language switches the entire editor, preserves text and caret, and persists after reload", async ({
  page,
}, info) => {
  await open(page);
  await expect.poll(async () => !!(await stored(page))).toBe(true);
  const editor = page.locator(".screenplay-editor");
  await editor.locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  const before = await editor.evaluate((el) => el.textContent);
  const caret = await page.evaluate(() => window.getSelection().anchorOffset);
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => window.getSelection().anchorOffset)).toBe(
    caret,
  );
  expect(await editor.evaluate((el) => el.textContent)).toBe(before);
  await expect(page.locator(".document-title")).toHaveText("Русское название");
  await expect(mode(page, "Screenplay")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Editor tools" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".screenplay-format-bar")
      .getByRole("button", { name: "Action", exact: true }),
  ).toHaveText(/Action/);
  await page.getByRole("button", { name: "Components", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Screenplay components",
  });
  await expect(panel.getByText("Characters", { exact: true })).toBeVisible();
  await panel.locator('[data-component-preview="anna"]').click();
  await expect(panel.getByLabel("Name", { exact: true })).toHaveValue("Анна");
  await expect(
    panel.getByRole("textbox", { name: /^Description/ }),
  ).toHaveValue("Персонажи");
  await expect(
    panel.getByRole("button", { name: "Upload image", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Document settings", exact: true })
    .click();
  await expect(page.getByLabel("Document zoom", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page
    .getByRole("tab", { name: "Keyboard shortcuts", exact: true })
    .click();
  await expect(
    page.getByText("Ctrl + mouse wheel", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Ctrl + click", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await mode(page, "Outline").click();
  await page.locator('[data-card-id="card"] .outline-card-title').click();
  await expect(page.getByLabel("Card text", { exact: true })).toHaveValue(
    "Русский текст карточки",
  );
  await page
    .getByRole("button", { name: "Dramatic intensity chart", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", {
      name: "Dramatic intensity chart",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Card title", { exact: true })).toHaveValue(
    "Завязка",
  );
  await page.screenshot({ path: info.outputPath("english-outline.png") });
  await page.reload();
  await expect(mode(page, "Screenplay")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.setViewportSize({ width: 390, height: 844 });
  const language = await page.locator(".language-switch").boundingBox();
  const view = await page.locator(".document-view-toggle").boundingBox();
  expect(language.x + language.width).toBeLessThanOrEqual(view.x);
  expect(view.x + view.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("english-mobile.png") });
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await expect(mode(page, "Сценарий")).toBeVisible();
});

test("graph dots and connecting gradients track card colors while editing", async ({
  page,
}, info) => {
  await open(page);
  await mode(page, "Аутлайн").click();
  await page
    .getByRole("button", { name: "График драматичности", exact: true })
    .click();
  const graph = page.getByRole("complementary", {
    name: "График драматичности",
    exact: true,
  });
  const dots = graph.locator(".drama-dot");
  await expect(dots.nth(0)).toHaveAttribute("fill", "#f06c43");
  await expect(dots.nth(1)).toHaveAttribute("fill", "#1b2eff");
  const gradient = graph.locator("linearGradient");
  await expect(gradient.locator('stop[offset="0%"]')).toHaveAttribute(
    "stop-color",
    "#f06c43",
  );
  await expect(gradient.locator('stop[offset="100%"]')).toHaveAttribute(
    "stop-color",
    "#1b2eff",
  );
  await graph
    .getByRole("button", { name: "Завязка: драматичность 3 из 10" })
    .click();
  await page.getByRole("button", { name: "Зелёный", exact: true }).click();
  const color = await page
    .getByRole("button", { name: "Зелёный", exact: true })
    .evaluate((el) => el.style.getPropertyValue("--card-color"));
  await expect(dots.nth(0)).toHaveAttribute("fill", color);
  await expect(gradient.locator('stop[offset="0%"]')).toHaveAttribute(
    "stop-color",
    color,
  );
  await expect(dots.nth(1)).toHaveAttribute("fill", "#1b2eff");
  await page.screenshot({ path: info.outputPath("card-colored-graph.png") });
});

test("act collapse persists and search can find cards inside a collapsed act", async ({
  page,
}) => {
  await open(page);
  await mode(page, "Аутлайн").click();
  const act = page.locator('.outline-column[data-column-id="act"]');
  await act.getByRole("button", { name: "Свернуть карточки в Начало" }).click();
  await expect(act.locator(".outline-card-list")).toBeHidden();
  await expect(
    act.getByRole("button", { name: "Развернуть карточки в Начало" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(async () => (await stored(page))?.outline.columns[0].collapsed)
    .toBe(true);
  await page.getByLabel("Поиск карточек", { exact: true }).fill("Завязка");
  await expect(act.locator('[data-card-id="card"]')).toBeVisible();
  await page.getByLabel("Поиск карточек", { exact: true }).fill("");
  await expect(act.locator(".outline-card-list")).toBeHidden();
  await page.reload();
  await mode(page, "Аутлайн").click();
  await expect(act.locator(".outline-card-list")).toBeHidden();
  await act
    .getByRole("button", { name: "Развернуть карточки в Начало" })
    .click();
  await expect(act.locator('[data-card-id="card"]')).toBeVisible();
});

test("thumbnail chooser is hidden, icon button opens it and image errors follow language", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await page.locator('[data-component-preview="anna"]').click();
  const field = page.locator(".thumbnail-field");
  const input = field.getByLabel("Файл миниатюры");
  await expect(input).toBeHidden();
  await expect(input).toHaveCSS("display", "none");
  await expect(
    field.getByRole("button", { name: "Загрузить картинку", exact: true }),
  ).toBeVisible();
  const choosing = page.waitForEvent("filechooser");
  await field
    .getByRole("button", { name: "Загрузить картинку", exact: true })
    .click();
  const chooser = await choosing;
  await chooser.setFiles({
    name: "wrong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(field.getByRole("alert")).toHaveText(
    "Выберите JPG, PNG или WebP размером до 5 МБ.",
  );
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(field.getByRole("alert")).toHaveText(
    "Choose a JPG, PNG or WebP image up to 5 MB.",
  );
  await expect(field.getByLabel("Thumbnail file")).toBeHidden();
});

test("landing and PRO gate translate, including rejected credentials", async ({
  page,
}) => {
  await page.route(codesRoute, async (route) =>
    route.fulfill(await listResponse()),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Screenwriting without chaos");
  await expect(page.locator(".landing-outline-preview")).toBeVisible();
  await expect(page.locator(".landing-tyt-preview")).toBeVisible();
  await expect(page.locator(".landing")).not.toContainText(/[А-Яа-яЁё]/);
  await page.goto("/pro");
  await expect(
    page.getByRole("heading", { name: "Sign in to Pro" }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("wrong@example.test");
  await page.getByLabel("Access key", { exact: true }).fill("ABC123");
  await page.getByRole("button", { name: "Open Pro", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The email or key is incorrect. Check both fields or open the free version.",
  );
  await page.getByRole("button", { name: "RU", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Email или ключ не подошли. Проверьте оба поля или откройте бесплатную версию.",
  );
});
