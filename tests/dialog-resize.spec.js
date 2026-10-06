import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

async function open(page) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404, body: "Unavailable in this isolated test" }),
  );
  const project = createProject("Проверка диалогов");
  project.id = "dialog-resize";
  await page.addInitScript((project) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
    localStorage.setItem("tyter.active", project.id);
    localStorage.setItem("tyter.language.v1", "ru");
  }, project);
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
const kinds = [
  {
    panel: "Компоненты",
    add: "Добавить: Персонажи",
    title: "Новый компонент",
    field: "components",
    name: "Анна",
  },
  {
    panel: "Реквизит",
    add: "Добавить реквизит",
    title: "Новый реквизит",
    field: "props",
    name: "Лампа",
  },
];

for (const kind of kinds)
  test(`${kind.title}: resizing beyond the popup keeps the draft and allows creation`, async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("button", { name: kind.panel, exact: true }).click();
    await page.getByRole("button", { name: kind.add, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: kind.title, exact: true });
    await dialog.getByLabel("Название", { exact: true }).fill(kind.name);
    const description = "Описание, которое должно сохраниться.\n".repeat(50);
    const textarea = dialog.locator("textarea");
    await textarea.fill(description);
    const field = await textarea.boundingBox();
    const box = await dialog.boundingBox();
    await page.mouse.move(
      field.x + field.width - 2,
      field.y + field.height - 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width + 70,
      field.y + field.height + 180,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await expect
      .poll(async () => (await textarea.boundingBox()).height)
      .toBeGreaterThan(field.height + 50);
    await expect(dialog.getByLabel("Название", { exact: true })).toHaveValue(
      kind.name,
    );
    await expect(textarea).toHaveValue(description);
    await dialog.click({ position: { x: 10, y: 60 } });
    await expect(dialog).toBeVisible();
    await textarea.focus();
    await page.keyboard.press("Control+Enter");
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(async ({ field, name }) => {
          const { browserRequest } = await import("/src/browser-files.js");
          const project = (await browserRequest("documents")).documents.find(
            (item) => item.id === "dialog-resize",
          );
          return project?.[field]?.find((item) => item.name === name)
            ?.description;
        }, kind),
      )
      .toBe(description.trim());
  });

test("dragging from inside and clicking popup padding do not dismiss; backdrop click, close button and Esc do", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  const add = page.getByRole("button", {
    name: "Добавить: Персонажи",
    exact: true,
  });
  const dialog = page.getByRole("dialog", {
    name: "Новый компонент",
    exact: true,
  });
  await add.click();
  const box = await dialog.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(8, 8, { steps: 8 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toHaveCount(0);
  await add.click();
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await add.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
