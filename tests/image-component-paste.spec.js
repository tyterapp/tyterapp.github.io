import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

async function open(page, { free = false, components = [] } = {}) {
  if (!free) await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ json: { documents: [] } }),
  );
  const doc = createProject("Картинки в компонентах");
  doc.id = "image-component-test";
  doc.content.content = [
    { type: "paragraph", attrs: { format: "scene", blockId: "scene" } },
  ];
  doc.components = components;
  await page.addInitScript((doc) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.language.v1", "ru");
    localStorage.setItem("tyter.onboarding.v1", "done");
    const original = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => {
      if (window.holdImageDecoding)
        await new Promise((resolve) => {
          window.resumeImageDecoding = resolve;
        });
      return original(...args);
    };
  }, doc);
  await page.goto(free ? "/free" : "/pro");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
async function transfer(
  page,
  files = [{ type: "image/png", name: "image.png" }],
) {
  return page.evaluateHandle(async (files) => {
    const transfer = new DataTransfer();
    for (const options of files) {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#85b9ef";
      ctx.fillRect(0, 0, 160, 100);
      ctx.fillStyle = "#f4bd58";
      ctx.fillRect(30, 20, 100, 60);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, options.type),
      );
      const data = options.invalid ? new Blob(["not an image"]) : blob;
      const padding = options.size
        ? new Uint8Array(Math.max(0, options.size - data.size))
        : new Uint8Array();
      transfer.items.add(
        new File([data, padding], options.name, { type: options.type }),
      );
    }
    return transfer;
  }, files);
}
async function paste(page, data) {
  await page
    .locator(".screenplay-editor")
    .evaluate((element, clipboardData) => {
      element.focus();
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, data);
}
const sidebar = (page) => page.locator(".components-drawer:not(.props-drawer)");
const stored = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents.find(
      (item) => item.id === "image-component-test",
    );
  });
test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("all suggestion labels align with the shortcut hint, including components", async ({
  page,
}, info) => {
  await open(page, {
    components: [
      {
        id: "room",
        name: "Комната",
        type: "place",
        description: "",
        color: "#1b2eff",
      },
    ],
  });
  const popup = page.getByRole("listbox", { name: "Подсказки" });
  await expect(popup).toBeVisible();
  const aligned = async () =>
    popup.evaluate((popup) => {
      const hint = popup.querySelector(".suggestion-hint");
      const x =
        hint.getBoundingClientRect().left +
        parseFloat(getComputedStyle(hint).paddingLeft);
      return [...popup.querySelectorAll(".suggestion-label")].every(
        (label) => Math.abs(label.getBoundingClientRect().left - x) < 1,
      );
    });
  expect(await aligned()).toBe(true);
  await page.screenshot({ path: info.outputPath("suggestion-insets.png") });
  await page.keyboard.insertText("КОМ");
  await expect(popup.getByRole("option")).toContainText("Комната");
  await expect(popup.locator(".suggestion-icon")).toBeVisible();
  expect(await aligned()).toBe(true);
  await page.keyboard.press("Control+Enter");
  await expect(
    page.locator('.screenplay-editor [data-entity-id="room"]'),
  ).toHaveText("КОМНАТА");
});

test("Ctrl+V creates named image components, shows the overlay and opens editing in RU and ENG", async ({
  page,
}, info) => {
  await open(page);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 100;
    canvas.getContext("2d").fillRect(0, 0, 160, 100);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    window.holdImageDecoding = true;
  });
  await page.keyboard.press("Control+v");
  const overlay = page.getByRole("status", { name: "Вставка изображения" });
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Добавляем картинку");
  await page.screenshot({ path: info.outputPath("image-processing.png") });
  await page.evaluate(() => {
    window.holdImageDecoding = false;
    window.resumeImageDecoding();
  });
  await expect(
    sidebar(page).getByLabel("Название", { exact: true }),
  ).toHaveValue("Без названия");
  await expect(sidebar(page).locator(".thumbnail-field-image")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(overlay).toHaveCount(0);
  await expect(
    page.locator(".screenplay-editor img:not(.ProseMirror-separator)"),
  ).toHaveCount(0);
  await page.keyboard.press("Control+v");
  await expect(
    sidebar(page).getByLabel("Название", { exact: true }),
  ).toHaveValue("Без названия 2");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await page.locator(".screenplay-editor").click();
  await page.keyboard.press("Control+v");
  await expect(sidebar(page).getByLabel("Name", { exact: true })).toHaveValue(
    "Untitled",
  );
  await page.locator(".screenplay-editor").click();
  await page.keyboard.press("Control+v");
  await expect(sidebar(page).getByLabel("Name", { exact: true })).toHaveValue(
    "Untitled 2",
  );
  await page.screenshot({
    path: info.outputPath("pasted-image-component.png"),
  });
  await expect
    .poll(async () => (await stored(page))?.components.length)
    .toBe(4);
  const roundTrip = await page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const doc = (await browserRequest("documents")).documents.find(
      (item) => item.id === "image-component-test",
    );
    return readTYT(await (await exportTYT(doc)).text());
  });
  expect(roundTrip.components.map((component) => component.name)).toEqual([
    "Без названия",
    "Без названия 2",
    "Untitled",
    "Untitled 2",
  ]);
  expect(
    roundTrip.components.every((component) =>
      component.thumbnail.startsWith("data:image/jpeg;base64,"),
    ),
  ).toBe(true);
  expect(
    roundTrip.content.content
      .flatMap((paragraph) =>
        (paragraph.content || []).map((part) => part.text || ""),
      )
      .join(""),
  ).toBe("");
  await page.reload();
  await expect
    .poll(async () => (await stored(page))?.components.length)
    .toBe(4);
});

test("dropping JPEG, PNG and WebP shows a drop overlay and creates all components after dragend", async ({
  page,
}, info) => {
  await open(page);
  const data = await transfer(page, [
    { type: "image/jpeg", name: "photo.jpg" },
    { type: "image/png", name: "photo.png" },
    { type: "image/webp", name: "photo.webp" },
  ]);
  const column = page.locator(".editor-column");
  await column.dispatchEvent("dragenter", { dataTransfer: data });
  await expect(
    page.getByRole("status", { name: "Вставка изображения" }),
  ).toContainText("Отпустите картинку");
  await page.screenshot({ path: info.outputPath("image-drop-overlay.png") });
  await page.evaluate(() => {
    window.holdImageDecoding = true;
  });
  await column.dispatchEvent("drop", { dataTransfer: data });
  await column.dispatchEvent("dragend", { dataTransfer: data });
  await expect(
    page.getByRole("status", { name: "Вставка изображения" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!window.resumeImageDecoding))
    .toBe(true);
  await page.evaluate(() => {
    window.holdImageDecoding = false;
    window.resumeImageDecoding();
  });
  await expect(
    sidebar(page).getByLabel("Название", { exact: true }),
  ).toHaveValue("Без названия 3");
  await expect(sidebar(page).locator(".component-item")).toHaveCount(3);
  await expect(
    page.locator(".screenplay-editor img:not(.ProseMirror-separator)"),
  ).toHaveCount(0);
});

test("image validation accepts exactly 10 MB and rejects oversized, unsupported and spoofed files without partial creation", async ({
  page,
}) => {
  await open(page);
  const max = 10 * 1024 * 1024;
  await paste(
    page,
    await transfer(page, [{ type: "image/png", name: "limit.png", size: max }]),
  );
  await expect(
    sidebar(page).getByLabel("Название", { exact: true }),
  ).toHaveValue("Без названия");
  for (const files of [
    [{ type: "image/png", name: "large.png", size: max + 1 }],
    [{ type: "image/gif", name: "animation.gif", invalid: true }],
    [{ type: "image/svg+xml", name: "vector.svg", invalid: true }],
    [
      { type: "image/png", name: "valid.png" },
      { type: "image/png", name: "spoof.png", invalid: true },
    ],
  ]) {
    await paste(page, await transfer(page, files));
    await expect(page.getByRole("alert")).toContainText(
      "Выберите JPG, PNG или WebP размером до 10 МБ.",
    );
    await expect(sidebar(page).locator(".component-item")).toHaveCount(1);
    await page.getByRole("button", { name: "Закрыть уведомление" }).click();
  }
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await paste(
    page,
    await transfer(page, [
      { type: "image/png", name: "large.png", size: max + 1 },
    ]),
  );
  await expect(page.getByRole("alert")).toContainText(
    "Choose a JPG, PNG or WebP image up to 10 MB.",
  );
});

test("Esc cancels a pending image and subsequent text paste works normally", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    window.holdImageDecoding = true;
  });
  await paste(page, await transfer(page));
  await expect(
    page.getByRole("status", { name: "Вставка изображения" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!window.resumeImageDecoding))
    .toBe(true);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.holdImageDecoding = false;
    window.resumeImageDecoding();
  });
  await expect(
    page.getByRole("status", { name: "Вставка изображения" }),
  ).toHaveCount(0);
  await page.evaluate(async () =>
    navigator.clipboard.writeText("ОБЫЧНЫЙ ТЕКСТ"),
  );
  await page.locator(".screenplay-editor").click();
  await page.keyboard.press("Control+v");
  await expect(page.locator(".screenplay-editor")).toContainText(
    "ОБЫЧНЫЙ ТЕКСТ",
  );
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(sidebar(page).locator(".component-item")).toHaveCount(0);
});

test("the context menu can paste an image from the clipboard", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 80;
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  });
  await page.locator(".screenplay-editor p").click({ button: "right" });
  const pasteItem = page.getByRole("menuitem", {
    name: "Вставить",
  });
  await expect(pasteItem).toBeEnabled();
  await pasteItem.click();
  await expect(
    sidebar(page).getByLabel("Название", { exact: true }),
  ).toHaveValue("Без названия");
  await expect(sidebar(page).locator(".thumbnail-field-image")).toBeVisible();
});

test("pasted images respect the FREE ten-component limit", async ({ page }) => {
  await open(page, {
    free: true,
    components: Array.from({ length: 10 }, (_, index) => ({
      id: `existing-${index}`,
      name: `Компонент ${index}`,
      type: "character",
      description: "",
    })),
  });
  await paste(page, await transfer(page));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(sidebar(page).locator(".component-item")).toHaveCount(10);
});
