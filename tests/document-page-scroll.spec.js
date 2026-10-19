import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

test.setTimeout(60000);
async function open(page, { zoom = 100, width = 1600, count = 420 } = {}) {
  await grantPro(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Прокрутка по страницам");
  doc.id = "document-page-scroll";
  doc.metadata.documentZoom = zoom;
  doc.content.content = Array.from({ length: count }, (_, index) => ({
    type: "paragraph",
    attrs: { format: index ? "action" : "scene", blockId: `block-${index}` },
    content: [
      {
        type: "text",
        text: index
          ? `${index}. ` + "The story keeps moving forward. ".repeat(8)
          : "INT. ROOM — DAY",
      },
    ],
  }));
  await page.addInitScript((doc) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.editor-intro.v1", "seen");
    localStorage.setItem("tyter.language.v1", "ru");
  }, doc);
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect
    .poll(() => page.locator(".revision-page-background").count())
    .toBeGreaterThan(count > 100 ? 22 : 1);
  await page
    .locator(".minimal-scroll")
    .evaluate((element) => element.scrollTo(0, 0));
  const bounds = await page.locator(".minimal-scroll").boundingBox();
  await page.mouse.move(bounds.x + 120, bounds.y + 160);
}

const position = (page, index) =>
  page.locator(".minimal-scroll").evaluate((element, index) => {
    const target = element.querySelectorAll(".revision-page-background")[index];
    const bar = element.querySelector(".mobile-page-version-bar");
    const offset =
      target.getBoundingClientRect().top -
      element.getBoundingClientRect().top -
      element.clientTop -
      (bar?.getBoundingClientRect().height || 0) +
      element.scrollTop;
    return Math.min(offset, element.scrollHeight - element.clientHeight);
  }, index);
const scrollTop = (page) =>
  page.locator(".minimal-scroll").evaluate((element) => element.scrollTop);
const state = (page) =>
  page.locator(".screenplay-editor").evaluate((element) => ({
    content: element.editor.getJSON(),
    selection: element.editor.state.selection.toJSON(),
  }));

test("Shift wheel jumps ten pages in both directions, handles horizontal wheel deltas and clamps at document ends", async ({
  page,
}) => {
  await open(page);
  const before = await state(page);
  const target = await position(page, 10);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 100);
  await expect.poll(() => scrollTop(page)).toBeCloseTo(target, 0);
  const next = await position(page, 20);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => scrollTop(page)).toBeCloseTo(next, 0);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => scrollTop(page)).toBeCloseTo(target, 0);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => scrollTop(page)).toBe(0);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => scrollTop(page)).toBe(0);
  await page.keyboard.up("Shift");
  await page
    .locator(".screenplay-editor")
    .dispatchEvent("wheel", {
      deltaX: 120,
      deltaY: 0,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
  await expect.poll(() => scrollTop(page)).toBeCloseTo(target, 0);
  const frame = page.locator(".minimal-scroll");
  await frame.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  const end = await scrollTop(page);
  await frame.dispatchEvent("wheel", {
    deltaY: 100,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  expect(await scrollTop(page)).toBe(end);
  expect(await frame.evaluate((element) => element.scrollLeft)).toBe(0);
  expect(await state(page)).toEqual(before);
});

test("Ctrl+Shift wheel moves one rendered page at 150% zoom while Ctrl wheel still changes zoom", async ({
  page,
}) => {
  await open(page, { zoom: 150 });
  const before = await state(page);
  const target = await position(page, 1);
  const paper = page.locator(".script-paper");
  await expect(paper).toHaveCSS("zoom", "1.5");
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 100);
  await expect.poll(() => scrollTop(page)).toBeCloseTo(target, 0);
  const second = await position(page, 2);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => scrollTop(page)).toBeCloseTo(second, 0);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => scrollTop(page)).toBeCloseTo(target, 0);
  await expect(paper).toHaveCSS("zoom", "1.5");
  expect(await state(page)).toEqual(before);
  await page.keyboard.up("Shift");
  await page.mouse.wheel(0, 100);
  await expect(paper).toHaveCSS("zoom", "1.4");
  await page.keyboard.up("Control");
});

test("page jumps respect the sticky page toolbar in the narrow layout", async ({
  page,
}) => {
  await open(page, { width: 390, count: 40 });
  const target = await position(page, 1);
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 100);
  await expect.poll(() => scrollTop(page)).toBeCloseTo(target, 0);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => scrollTop(page)).toBe(0);
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
});
