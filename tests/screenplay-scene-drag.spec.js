import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

test.setTimeout(60000);
const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
async function open(page, { theme = "dark", count = 3, zoom = 100 } = {}) {
  await grantPro(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Перенос сцен");
  doc.id = "screenplay-scene-drag";
  doc.metadata.documentZoom = zoom;
  doc.content.content = Array.from({ length: count }, (_, index) => [
    paragraph("scene", `INT. ROOM ${index + 1} — DAY`, `scene-${index + 1}`),
    paragraph(
      "action",
      count > 3 ? "The story keeps moving. ".repeat(16) : `Action ${index + 1}`,
      `action-${index + 1}`,
    ),
    paragraph("character", `PERSON ${index + 1}`, `character-${index + 1}`),
    paragraph("speech", `Line ${index + 1}`, `speech-${index + 1}`),
  ]).flat();
  doc.sceneVariants = {
    "scene-1": {
      B: [
        paragraph("scene", "ALT ROOM", "scene-1"),
        paragraph("action", "Alternative", "alt"),
      ],
    },
  };
  doc.sceneShots = {
    "scene-1": { A: { drama: 7, synopsis: "Original settings" } },
  };
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("drag-seed")) return;
      sessionStorage.setItem("drag-seed", "1");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.editor-intro.v1", "seen");
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc, theme },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect(page.locator(".scene-drag-handle")).toHaveCount(count);
}
const editor = (page) => page.locator(".screenplay-editor");
const content = (page) => editor(page).evaluate((e) => e.editor.getJSON());
const order = (page) =>
  editor(page).evaluate((e) =>
    e.editor
      .getJSON()
      .content.filter((p) => p.attrs.format === "scene")
      .map((p) => p.attrs.blockId),
  );
const scene = (page, number) =>
  editor(page).locator(`[data-block-id="scene-${number}"]`);
const scrollTop = (page) =>
  page.locator(".minimal-scroll").evaluate((e) => e.scrollTop);
const savedDocument = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("tyter.local-files.v1", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("files")
            .objectStore("files")
            .get("documents");
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            db.close();
            resolve(
              read.result?.find((doc) => doc.id === "screenplay-scene-drag"),
            );
          };
        };
      }),
  );
async function start(page, number, thumbnail = false) {
  const source = scene(page, number).locator(
    thumbnail ? ".scene-shot-button" : ".scene-drag-handle",
  );
  const rect = await source.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await expect(page.locator(".scene-reorder-preview")).toBeVisible();
}
for (const theme of ["light", "dark"])
  test(`${theme}: mouse hold shows visible scene destinations, inserts before a scene and preserves complete scene data through Undo and Redo`, async ({
    page,
  }) => {
    await open(page, { theme });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const before = await content(page);
    await start(page, 3);
    await expect(page.locator(".scene-reorder-zone")).toHaveCount(3);
    await expect(
      page.locator('.scene-reorder-zone[data-source="true"]'),
    ).toHaveCount(1);
    const target = await scene(page, 1).boundingBox();
    await page.mouse.move(target.x + 120, target.y + 2, { steps: 8 });
    await expect(
      page.locator('.scene-reorder-zone[data-target="true"]'),
    ).toHaveCount(1);
    await expect(page.locator(".scene-reorder-insertion")).toBeVisible();
    await expect(page.locator(".scene-reorder-hint")).toContainText(
      "Перед сценой 1",
    );
    expect(await content(page)).toEqual(before);
    await page.screenshot({ path: `.cache/screenplay-drag-${theme}.png` });
    await page.mouse.up();
    await expect
      .poll(() => order(page))
      .toEqual(["scene-3", "scene-1", "scene-2"]);
    await expect(page.locator(".scene-reorder-layer")).toHaveCount(0);
    const moved = await content(page);
    expect(moved.content.slice(0, 4)).toEqual(before.content.slice(8));
    await expect(scene(page, 3)).toHaveAttribute(
      "data-outline-navigation-target",
      "true",
    );
    await page.keyboard.press("Control+z");
    await expect.poll(() => content(page)).toEqual(before);
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(() => content(page)).toEqual(moved);
    await expect
      .poll(async () =>
        (await savedDocument(page))?.content.content.map(
          (node) => node.attrs.blockId,
        ),
      )
      .toEqual(moved.content.map((node) => node.attrs.blockId));
    const saved = await savedDocument(page);
    expect(saved.sceneShots["scene-1"].A.drama).toBe(7);
    expect(saved.sceneVariants["scene-1"].B[1].content[0].text).toBe(
      "Alternative",
    );
    await page.reload();
    await expect
      .poll(() => order(page))
      .toEqual(["scene-3", "scene-1", "scene-2"]);
    expect(errors).toEqual([]);
  });

test("thumbnail remains clickable, can drag a scene after the final scene, and Escape and outside drops cancel cleanly", async ({
  page,
}) => {
  await open(page);
  await scene(page, 1).locator(".scene-shot-button").click();
  await expect(page.locator(".story-inspector")).toBeVisible();
  const before = await content(page);
  await start(page, 1, true);
  const target = await scene(page, 3).boundingBox();
  await page.mouse.move(target.x + 120, target.y + 100, { steps: 10 });
  await expect(page.locator(".scene-reorder-hint")).toContainText(
    "После сцены 3",
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await content(page)).toEqual(before);
  await expect(page.locator(".scene-reorder-layer")).toHaveCount(0);
  await start(page, 1, true);
  await page.mouse.move(25, 20, { steps: 8 });
  await page.mouse.up();
  expect(await content(page)).toEqual(before);
  await expect(page.locator(".scene-reorder-layer")).toHaveCount(0);
  await start(page, 1, true);
  await page.mouse.move(target.x + 120, target.y + 100, { steps: 10 });
  await expect(page.locator(".scene-reorder-hint")).toContainText(
    "После сцены 3",
  );
  await page.mouse.up();
  await expect
    .poll(() => order(page))
    .toEqual(["scene-2", "scene-3", "scene-1"]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => content(page)).toEqual(before);
  const handle = scene(page, 1).locator(".scene-drag-handle");
  await handle.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect
    .poll(() => order(page))
    .toEqual(["scene-2", "scene-1", "scene-3"]);
});

test("edge scrolling is gradual in both directions and speeds up farther outside the viewport at 150% zoom", async ({
  page,
}) => {
  await open(page, { count: 40, zoom: 150 });
  const before = await content(page);
  await scene(page, 8).locator(".scene-drag-handle").scrollIntoViewIfNeeded();
  const scroller = page.locator(".minimal-scroll");
  const viewport = await scroller.boundingBox();
  await start(page, 8);
  const x = viewport.x + viewport.width / 2;
  await page.mouse.move(x, viewport.y + 60);
  await page.waitForTimeout(250);
  const nearStart = await scrollTop(page);
  await page.waitForTimeout(300);
  const nearEnd = await scrollTop(page);
  expect(nearStart - nearEnd).toBeGreaterThan(1);
  await page.mouse.move(x, viewport.y - 30);
  await page.waitForTimeout(250);
  const farStart = await scrollTop(page);
  await page.waitForTimeout(300);
  const farEnd = await scrollTop(page);
  expect(farStart - farEnd).toBeGreaterThan((nearStart - nearEnd) * 2);
  await page.mouse.move(x, viewport.y + viewport.height + 15);
  const downStart = await scrollTop(page);
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(downStart + 100);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const stopped = await scrollTop(page);
  await page.waitForTimeout(250);
  expect(await scrollTop(page)).toBe(stopped);
  expect(await content(page)).toEqual(before);
  await expect(page.locator("body")).not.toHaveClass(
    /screenplay-scene-dragging/,
  );
});
