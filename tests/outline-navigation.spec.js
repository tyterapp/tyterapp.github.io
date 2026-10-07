import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

async function open(page, { zoom, width, height, fontSize = 12 }) {
  await page.setViewportSize({ width, height });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const project = createProject("Переходы между сценами");
  project.id = "scene-navigation";
  project.metadata.documentZoom = zoom;
  project.metadata.fontSize = fontSize;
  project.content.content = Array.from({ length: 70 }, (_, i) => ({
    type: "paragraph",
    attrs: { format: "scene", blockId: `scene-${i}` },
    content: [{ type: "text", text: `ИНТ. СЦЕНА ${i + 1} — ДЕНЬ` }],
  }));
  project.outline = {
    columns: [{ id: "act", title: "Акт 1" }],
    cards: project.content.content.map((block, i) => ({
      id: `card-${i}`,
      columnId: "act",
      blockId: block.attrs.blockId,
      title: block.content[0].text,
      text: "Описание карточки",
      drama: 3,
      comments: [],
    })),
  };
  await page.addInitScript((project) => {
    localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
    localStorage.setItem("tyter.active", project.id);
    localStorage.setItem("tyter.language.v1", "ru");
  }, project);
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.locator(".page-guide").count())
    .toBeGreaterThan(2);
  return project;
}
const savedContent = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents.find(
      (item) => item.id === "scene-navigation",
    )?.content;
  });
const cursorGeometry = (page) =>
  page.evaluate(() => {
    const selection = window.getSelection();
    const anchor = selection.anchorNode;
    const paragraph = (
      anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement
    ).closest("p");
    const range = selection.getRangeAt(0).cloneRange();
    let caret = range.getBoundingClientRect();
    if (!caret.height) {
      const walker = document.createTreeWalker(
        paragraph,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            node.parentElement.closest(".ProseMirror-widget")
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
        },
      );
      const text = walker.nextNode();
      range.setStart(text, 0);
      range.setEnd(text, 1);
      caret = range.getBoundingClientRect();
    }
    const scroll = paragraph.closest(".minimal-scroll");
    const viewport = scroll.getBoundingClientRect();
    const footer = scroll
      .closest(".editor-column")
      .querySelector(".minimal-footer")
      .getBoundingClientRect();
    const top = Math.max(viewport.top, 0);
    const bottom = Math.min(
      viewport.top + scroll.clientHeight,
      footer.top,
      innerHeight,
    );
    return {
      blockId: paragraph.dataset.blockId,
      top: caret.top,
      bottom: caret.bottom,
      left: caret.left,
      right: caret.right,
      visibleTop: top,
      visibleBottom: bottom,
      visibleLeft: Math.max(0, viewport.left),
      visibleRight: Math.min(innerWidth, viewport.left + scroll.clientWidth),
      relativeY: ((caret.top + caret.bottom) / 2 - top) / (bottom - top),
    };
  });

for (const options of [
  { zoom: 100, width: 1440, height: 1000 },
  { zoom: 200, width: 1100, height: 600 },
  { zoom: 200, width: 390, height: 740 },
  { zoom: 200, width: 1440, height: 650, fontSize: 26 },
])
  test(`outline targets stay above midpoint with a visible cursor: ${options.zoom}% ${options.width}px, ${options.fontSize || 12}pt`, async ({
    page,
  }, info) => {
    const project = await open(page, options);
    const editor = page.locator(".screenplay-editor");
    await expect.poll(async () => !!(await savedContent(page))).toBe(true);
    const before = await savedContent(page);
    const padded = await editor
      .locator("p")
      .evaluateAll(
        (nodes) =>
          nodes.find(
            (node) => parseFloat(getComputedStyle(node).paddingTop) > 0,
          )?.dataset.blockId,
      );
    expect(padded).toBeTruthy();
    await editor.locator("p").last().click();
    await page.keyboard.press("End");
    await page.locator(".minimal-scroll").evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
      node.scrollTop = node.scrollHeight;
    });
    for (const blockId of [padded, "scene-69", "scene-0"]) {
      await page.keyboard.press("Alt+2");
      const card = project.outline.cards.find(
        (item) => item.blockId === blockId,
      );
      await page
        .getByRole("button", {
          name: `Перейти к сцене ${card.title}`,
          exact: true,
        })
        .click();
      const scene = editor.locator(`p[data-block-id="${blockId}"]`);
      await expect(editor).toBeFocused();
      await expect(scene).toHaveAttribute(
        "data-outline-navigation-target",
        "true",
      );
      const flash = scene.locator(".outline-navigation-flash");
      await expect(flash).toHaveCSS("animation-duration", "1s");
      const cursor = await cursorGeometry(page);
      expect(cursor.blockId).toBe(blockId);
      expect(cursor.top).toBeGreaterThanOrEqual(cursor.visibleTop + 8);
      expect(cursor.bottom).toBeLessThanOrEqual(cursor.visibleBottom - 8);
      expect(cursor.left).toBeGreaterThanOrEqual(cursor.visibleLeft + 8);
      expect(cursor.right).toBeLessThanOrEqual(cursor.visibleRight - 8);
      expect(cursor.relativeY).toBeLessThanOrEqual(0.5);
      await expect
        .poll(() =>
          flash.evaluate((node) => getComputedStyle(node).backgroundColor),
        )
        .not.toBe("rgba(0, 0, 0, 0)");
      if (blockId === padded)
        await page.screenshot({ path: info.outputPath("scene-arrival.png") });
      await expect(flash).toHaveCount(0);
      await expect(scene).not.toHaveAttribute(
        "data-outline-navigation-target",
        "true",
      );
      const settled = await cursorGeometry(page);
      expect(Math.abs(settled.top - cursor.top)).toBeLessThan(3);
    }
    expect(await savedContent(page)).toEqual(before);
    await page.keyboard.insertText("X");
    await expect(editor.locator('[data-block-id="scene-0"]')).toContainText(
      "XИНТ.",
    );
  });

test("drawer targets work with reduced motion and another target restarts the one-second flash", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, { zoom: 200, width: 900, height: 600 });
  await page.keyboard.press("Alt+2");
  await page.locator('[data-card-id="card-69"] .outline-card-title').click();
  await page
    .getByRole("button", { name: "Перейти к сцене карточки", exact: true })
    .click();
  const last = page.locator('[data-block-id="scene-69"]');
  await expect(last).toHaveAttribute("data-outline-navigation-target", "true");
  await expect(last.locator(".outline-navigation-flash")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(last.locator(".outline-navigation-flash")).toHaveCSS(
    "background-color",
    "rgb(255, 221, 176)",
  );
  expect((await cursorGeometry(page)).relativeY).toBeLessThanOrEqual(0.5);
  await page.keyboard.press("Alt+2");
  await page
    .getByRole("button", {
      name: "Перейти к сцене ИНТ. СЦЕНА 1 — ДЕНЬ",
      exact: true,
    })
    .click();
  const first = page.locator('[data-block-id="scene-0"]');
  await expect(first).toHaveAttribute("data-outline-navigation-target", "true");
  await expect(last).not.toHaveAttribute(
    "data-outline-navigation-target",
    "true",
  );
  await expect(page.locator(".outline-navigation-flash")).toHaveCount(1);
  expect((await cursorGeometry(page)).blockId).toBe("scene-0");
  await expect(first.locator(".outline-navigation-flash")).toHaveCount(0);
});
