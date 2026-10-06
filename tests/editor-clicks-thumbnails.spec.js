import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
async function open(page, { edition = "pro", zoom = 100, long = false } = {}) {
  if (edition === "pro") await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ json: { documents: [] } }),
  );
  const project = createProject("Проверка курсора и картинок");
  project.metadata.documentZoom = zoom;
  project.content.content = [
    paragraph("scene", "ИНТ. КОМНАТА — ДЕНЬ", "scene"),
    paragraph("action", "Лампа светит.", "action"),
    paragraph("action", "Анна входит.", "next"),
    ...(long
      ? Array.from({ length: 80 }, (_, i) =>
          paragraph("action", `Действие ${i + 1}.`, `line-${i}`),
        )
      : []),
  ];
  await page.addInitScript((project) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
    localStorage.setItem("tyter.active", project.id);
    localStorage.setItem("tyter.language.v1", "ru");
    localStorage.setItem("tyter.onboarding.v1", "done");
  }, project);
  await page.goto(`/${edition}`);
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
const caretBlock = (page) =>
  page.evaluate(() => {
    const anchor = window.getSelection()?.anchorNode;
    return (
      anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement
    )?.closest("p")?.dataset.blockId;
  });
const imageFile = async (page, width, height) => ({
  name: "image.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    await page.evaluate(
      ({ width, height }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#85b9ef";
        context.fillRect(0, 0, width, height);
        context.fillStyle = "#f4bd58";
        context.fillRect(width / 4, height / 4, width / 2, height / 2);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { width, height },
    ),
    "base64",
  ),
});

for (const [edition, zoom] of [
  ["free", 100],
  ["pro", 200],
])
  test(`${edition}: gaps between paragraphs keep the caret near the click at ${zoom}%`, async ({
    page,
  }) => {
    await open(page, { edition, zoom, long: true });
    const editor = page.locator(".screenplay-editor");
    const scroll = page.locator(".minimal-scroll");
    for (const [above, below] of [
      ["scene", "action"],
      ["action", "next"],
      ["line-40", "line-41"],
    ]) {
      await editor
        .locator(`[data-block-id="${below}"]`)
        .scrollIntoViewIfNeeded();
      const first = await editor
        .locator(`[data-block-id="${above}"]`)
        .boundingBox();
      const second = await editor
        .locator(`[data-block-id="${below}"]`)
        .boundingBox();
      const top = await scroll.evaluate((node) => node.scrollTop);
      await page.mouse.click(
        second.x + 20,
        (first.y + first.height + second.y) / 2,
      );
      await expect(editor).toBeFocused();
      expect([above, below]).toContain(await caretBlock(page));
      expect(
        Math.abs((await scroll.evaluate((node) => node.scrollTop)) - top),
      ).toBeLessThan(6);
      await page.keyboard.insertText(" Проверка.");
      await expect(
        editor.locator(`[data-block-id="${await caretBlock(page)}"]`),
      ).toContainText("Проверка.");
      await expect(editor.locator("p").last()).toHaveText("Действие 80.");
    }
    // Empty side margins next to existing text should also stay near that line.
    const next = editor.locator('[data-block-id="next"]');
    await next.scrollIntoViewIfNeeded();
    const line = await next.boundingBox();
    await page.mouse.click(line.x - 35, line.y + line.height / 2);
    await expect.poll(() => caretBlock(page)).toBe("next");
    // Regular text selection still uses the editor's native mouse handling.
    const action = editor.locator('[data-block-id="action"]');
    await action.dblclick({ position: { x: 10, y: 10 } });
    const selected = await page.evaluate(() =>
      window.getSelection().toString(),
    );
    expect(selected).toMatch(/\S/);
    await expect(action).toContainText(selected);
    expect(await caretBlock(page)).toBe("action");
  });

for (const kind of [
  {
    panel: "Компоненты",
    add: "Добавить: Персонажи",
    title: "Новый компонент",
    name: "Лампа",
  },
  {
    panel: "Реквизит",
    add: "Добавить реквизит",
    title: "Новый реквизит",
    name: "Ручка",
  },
])
  test(`${kind.title}: opening focuses the name and uploads show in the popup before saving`, async ({
    page,
  }, info) => {
    await open(page);
    await page.getByRole("button", { name: kind.panel, exact: true }).click();
    await page.getByRole("button", { name: kind.add, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: kind.title, exact: true });
    const name = dialog.getByLabel("Название", { exact: true });
    await expect(name).toBeFocused();
    await page.keyboard.insertText(kind.name);
    await expect(name).toHaveValue(kind.name);
    const file = dialog.getByLabel("Файл миниатюры");
    await file.setInputFiles(await imageFile(page, 400, 100));
    const image = dialog.locator(".thumbnail-field-image");
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((node) => node.complete && node.naturalWidth > 0),
      )
      .toBe(true);
    await expect(
      dialog.getByRole("button", { name: "Заменить картинку", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("uploaded-image-popup.png"),
    });
    await dialog
      .getByRole("button", { name: "Удалить миниатюру", exact: true })
      .click();
    await expect(image).toHaveCount(0);
    await file.setInputFiles(await imageFile(page, 100, 400));
    await expect(image).toBeVisible();
    await dialog.getByRole("button", { name: "Создать", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".component-item img")).toBeVisible();
  });

test("hover thumbnails follow image proportions, cap tall images and stay inside the viewport", async ({
  page,
}, info) => {
  await open(page);
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await page
    .getByRole("button", { name: "Добавить: Персонажи", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Новый компонент",
    exact: true,
  });
  await page.keyboard.insertText("Лампа");
  await dialog
    .getByLabel("Файл миниатюры")
    .setInputFiles(await imageFile(page, 600, 150));
  await dialog.getByRole("button", { name: "Создать", exact: true }).click();
  const row = page.locator(".component-item");
  const preview = page.locator(".thumbnail-preview");
  const image = preview.locator("img");
  await row.hover();
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((node) => node.complete && node.naturalWidth > 0),
    )
    .toBe(true);
  let size = await image.boundingBox();
  expect(size.width / size.height).toBeCloseTo(4, 1);
  expect(size.height).toBeLessThan(60);
  const wideHeight = (await preview.boundingBox()).height;
  await page.screenshot({ path: info.outputPath("wide-hover.png") });
  await row.click();
  await page
    .getByLabel("Файл миниатюры")
    .setInputFiles(await imageFile(page, 150, 600));
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await row.hover();
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((node) => node.complete && node.naturalHeight > 0),
    )
    .toBe(true);
  size = await image.boundingBox();
  expect(size.width / size.height).toBeCloseTo(0.25, 2);
  expect(size.height).toBeLessThanOrEqual(320);
  expect(size.height).toBeGreaterThan(300);
  expect((await preview.boundingBox()).height).toBeGreaterThan(
    wideHeight + 200,
  );
  await page.screenshot({ path: info.outputPath("tall-hover.png") });
  await page.setViewportSize({ width: 390, height: 500 });
  await page.mouse.move(380, 70);
  await row.hover();
  await expect(image).toBeVisible();
  const bubble = await preview.boundingBox();
  expect(bubble.x).toBeGreaterThanOrEqual(8);
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(390 - 8);
  expect(bubble.y).toBeGreaterThanOrEqual(8);
  expect(bubble.y + bubble.height).toBeLessThanOrEqual(500 - 8);
  await page.mouse.move(380, 70);
  await row.dispatchEvent("pointerover", { pointerType: "touch" });
  await expect(preview).toHaveCount(0);
});
