import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro, codesRoute, listResponse } from "./helpers/pro-access.js";
import { OUTLINE_STAGES } from "../src/outline-stages.js";

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
  await expect(page.locator(".landing-outline-preview")).toBeAttached();
  await expect(page.locator(".landing-tyt-preview")).toBeAttached();
  await expect(page.locator(".site-shell")).not.toContainText(/[А-Яа-яЁё]/);
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
