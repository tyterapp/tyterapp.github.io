import { test, expect } from "@playwright/test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { unzipSync } from "fflate";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const image = createCanvas(48, 27).toDataURL("image/png");
const drawing = { id: "ink", name: "Sketch", type: "rectangle", points: [[.2,.2],[.6,.7]], color: "#123456", width: 3, visible: true };
async function open(page) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) => route.fulfill({ status: 404 }));
  const doc = createProject("Frame regressions");
  doc.id = "frame-regressions";
  doc.content.content = [{ type: "paragraph", attrs: { format: "scene", blockId: "one" }, content: [{ type: "text", text: "INT. ROOM" }] }];
  doc.components = [{ id: "hero", name: "HERO", type: "character", description: "Red coat" }, { id: "room", name: "STUDIO", type: "place", description: "Brick walls" }];
  doc.sceneShots = { one: { A: { aspectRatio: "16:9", lighting: "soft", frames: [{ id: "f1", image: "", durationMs: 5000, layers: [drawing], comments: [{ id: "c", x: .7, y: .3, text: "Fix light", replies: [], strokes: [{ ...drawing, id: "annotation", type: "path" }] }] }] } } };
  await page.addInitScript((doc) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.editor-intro.v1", "seen");
    localStorage.setItem("tyter.language.v1", "ru");
  }, doc);
  await page.goto("/beta", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.locator(".document-view-toggle").getByRole("button", { name: "Раскадровка", exact: true }).click();
}

test("screenplay scene preview displays drawings without a background image", async ({ page }) => {
  await open(page);
  await page.locator(".document-view-toggle").getByRole("button", { name: "Сценарий", exact: true }).click();
  const preview = page.locator(".scene-shot-thumbnail").first();
  await expect(preview.locator("svg rect")).toHaveCount(1);
  await expect(preview.locator('img[src=""]')).toHaveCount(0);
});
async function edit(page) {
  await page.locator('.story-card[data-scene="one"]').getByRole("button", { name: "Открыть слайд 1" }).click();
  await expect(page.locator(".story-canvas-editor")).toBeVisible();
}
test("layer-only frame can be played with its drawing visible", async ({ page }) => {
  await open(page);
  await page.locator(".story-page-label").getByRole("button", { name: /Воспроизвести/ }).click();
  await expect(page.locator(".story-player-image svg rect")).toHaveCount(1);
  await expect(page.locator(".story-player output")).toHaveText("1 / 1");
});
test("frame artboard keeps the scene aspect ratio inside the available workspace", async ({ page }) => {
  await open(page); await edit(page);
  const surface = page.locator(".story-canvas-editor__surface");
  await expect.poll(async () => { const box = await surface.boundingBox(); return Number((box.width / box.height).toFixed(2)); }).toBe(1.78);
});

test("mobile frame editor keeps the canvas wide and its tools reachable above the layer panel", async ({ page }) => {
  await open(page); await edit(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const surface = page.locator(".story-canvas-editor__surface");
  await expect.poll(async () => {
    const box = await surface.boundingBox();
    return box.width > 300 && box.width < 390 && Math.abs(box.width / box.height - 16 / 9) < .02;
  }).toBe(true);
  const panel = await page.locator(".story-canvas-editor__side").boundingBox();
  const artboard = await surface.boundingBox();
  expect(panel.y).toBeGreaterThan(artboard.y + artboard.height);
  expect(Number((artboard.width / artboard.height).toFixed(2))).toBe(1.78);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole("button", { name: "Комментарий", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Комментарий", exact: true })).toBeInViewport();
});
test("image pasted in the frame editor becomes a selectable layer and survives keyboard delete undo", async ({ page }) => {
  await open(page); await edit(page);
  const surface = page.locator(".story-canvas-editor__surface");
  await surface.click({ position: { x: 15, y: 15 } });
  await surface.evaluate((el, image) => {
    const binary = atob(image.split(",")[1]), bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "clipboard.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, image);
  await expect(surface.locator("svg image")).toHaveCount(1);
  await expect(page.getByLabel("Название слоя")).toHaveCount(2);
  await expect(page.locator(".story-paste-dialog")).toHaveCount(0);
  const name = page.getByLabel("Название слоя").first();
  await name.fill("Clipboard photo"); await name.press("Backspace");
  await expect(surface.locator("svg image")).toHaveCount(1);
  await surface.click({ position: { x: 15, y: 15 } });
  await surface.locator("svg image").click();
  await page.keyboard.press("Delete");
  await expect(surface.locator("svg image")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(surface.locator("svg image")).toHaveCount(1);
  await page.getByRole("button", { name: "Закрыть редактор кадра" }).click();
  await expect(page.locator('.story-card[data-scene="one"] .story-card-slide')).toHaveCount(1);
});
test("global comment visibility hides pins and annotations and preserves comment text", async ({ page }) => {
  await open(page); await edit(page);
  const surface = page.locator(".story-canvas-editor__surface");
  await surface.getByRole("button", { name: "Открыть комментарий 1" }).click();
  await expect(surface.locator("polyline")).toHaveCount(1);
  await page.keyboard.press("Control+Shift+c");
  await expect(surface.locator(".story-canvas-editor__marker")).toHaveCount(0);
  await expect(surface.locator("polyline")).toHaveCount(0);
  await expect(page.locator(".story-canvas-editor__side")).toContainText("Fix light");
  await page.keyboard.press("Control+Shift+c");
  await expect(surface.getByRole("button", { name: "Открыть комментарий 1" })).toBeVisible();
  await expect(surface.locator("polyline")).toHaveCount(1);
});
test("AI settings prepare the selected character, location and shot in the request preview", async ({ page }) => {
  await open(page); await edit(page);
  const side = page.locator(".story-canvas-editor__side");
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await side.getByLabel("Персонаж", { exact: true }).selectOption("hero");
  await side.getByLabel("Локация", { exact: true }).selectOption("room");
  await side.getByLabel("Крупность плана", { exact: true }).selectOption("close");
  await side.getByRole("button", { name: "Создать кадры по описанию" }).click();
  const description = side.getByLabel("Описание для генерации");
  await expect(description).toHaveValue(/Red coat/);
  await expect(description).toHaveValue(/Brick walls/);
  await expect(description).toHaveValue(/Close up/);
  await expect(description).toHaveValue(/Soft light/);
});
test("PNG sequence composites image layers over the drawing at their saved geometry", async ({ page }) => {
  await open(page);
  const bytes = await page.evaluate(async () => {
    const { exportStoryboard } = await import("/src/storyboard-export.js");
    const doc = JSON.parse(localStorage.getItem("tyter.projects.v1"))[0];
    const red = document.createElement("canvas"); red.width = 40; red.height = 20;
    const context = red.getContext("2d"); context.fillStyle = "#ff0000"; context.fillRect(0, 0, 40, 20);
    doc.sceneShots.one.A.frames[0].layers = [
      { id: "drawing", type: "rectangle", points: [[.1,.1],[.9,.9]], color: "#0000ff", width: 5 },
      { id: "photo", type: "image", image: red.toDataURL("image/png"), points: [[.3,.3],[.7,.7]] },
    ];
    return Array.from(new Uint8Array(await (await exportStoryboard(doc, "png")).arrayBuffer()));
  });
  const files = unzipSync(Uint8Array.from(bytes));
  const png = await loadImage(Buffer.from(Object.entries(files).find(([name]) => name.endsWith(".png"))[1]));
  const canvas = createCanvas(png.width, png.height), context = canvas.getContext("2d"); context.drawImage(png, 0, 0);
  expect(Array.from(context.getImageData(640, 360, 1, 1).data)).toEqual([255, 0, 0, 255]);
  expect(Array.from(context.getImageData(128, 72, 1, 1).data)).toEqual([0, 0, 255, 255]);
});
