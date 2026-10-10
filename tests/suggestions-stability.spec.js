import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const popup = (page) =>
  page.getByRole("listbox", { name: "Подсказки", exact: true });

async function open(page, { theme = "light", width = 1440 } = {}) {
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Подсказки без мигания");
  doc.id = "suggestions-stability";
  doc.content.content = [
    paragraph("scene", "ТЕКСТ", "first"),
    paragraph("scene", "", "other"),
  ];
  await page.addInitScript(
    ({ doc, theme }) => {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc, theme },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.locator('[data-block-id="first"]').click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+1");
  await expect(popup(page)).toBeVisible();
}

async function observe(page) {
  await page.evaluate(() => {
    window.suggestionObserver?.disconnect();
    window.suggestionNode = document.querySelector(".word-suggestions");
    window.suggestionChanges = [];
    window.suggestionObserver = new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.removedNodes)
          if (
            node instanceof Element &&
            (node.matches(".word-suggestions") ||
              node.querySelector(".word-suggestions"))
          )
            window.suggestionChanges.push({
              time: performance.now(),
              event: "removed",
            });
    });
    window.suggestionObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

test("new scene heading and time suggestions stay visible while the caret is idle", async ({
  page,
}, info) => {
  await open(page);
  await observe(page);
  await page.mouse.move(1300, 700);
  await page.waitForTimeout(3500);
  await page.screenshot({
    path: info.outputPath("empty-scene-suggestions.png"),
  });
  expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
  await page.keyboard.press("Control+Enter");
  await expect(popup(page)).toHaveCount(0);
  await page.keyboard.insertText(" - ");
  await expect(popup(page)).toBeVisible();
  await observe(page);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: info.outputPath("time-suggestions.png") });
  expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
});

test("typing and deleting a valid prefix keeps the suggestion popup mounted", async ({
  page,
}) => {
  await open(page);
  await observe(page);
  for (const text of ["И", "Н", "Т"]) {
    await page.keyboard.insertText(text);
    await page.waitForTimeout(180);
  }
  await expect(popup(page).getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(popup(page).getByRole("option")).toHaveCount(4);
  expect(
    await page.evaluate(
      () =>
        window.suggestionNode === document.querySelector(".word-suggestions"),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
});

for (const width of [320, 1440])
  for (const theme of ["light", "dark"]) {
    test(`${width}px ${theme}: moving to another empty scene updates the open popup without hiding it`, async ({
      page,
    }, info) => {
      await open(page, { width, theme });
      await observe(page);
      const other = page.locator('[data-block-id="other"]');
      const rect = await other.boundingBox();
      // The popup may cover the middle of the next line on a narrow screen.
      await other.click({
        position: { x: rect.width - 4, y: rect.height / 2 },
      });
      await page.waitForTimeout(250);
      await expect(popup(page).getByRole("option")).toHaveCount(4);
      expect(
        await page.evaluate(
          () =>
            window.suggestionNode ===
            document.querySelector(".word-suggestions"),
        ),
      ).toBe(true);
      expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
      await page.screenshot({
        path: info.outputPath("stable-scene-suggestions.png"),
      });
      await page.keyboard.press("Control+Enter");
      await expect(page.locator('[data-block-id="other"]')).toContainText(
        "ИНТ.",
      );
    });
  }

test("silent scene replacement refreshes suggestions and cannot insert an old heading", async ({
  page,
}) => {
  await open(page);
  await observe(page);
  await page.evaluate(() => {
    const editor = document.querySelector(".ProseMirror").editor;
    const doc = editor.getJSON();
    const scene = doc.content.find((node) => !node.content?.length);
    const position = editor.state.selection.from;
    scene.content = [{ type: "text", text: "ИНТ. ДОМ — " }];
    editor
      .chain()
      .setContent(doc, { emitUpdate: false })
      .setTextSelection(position + scene.content[0].text.length)
      .run();
  });
  await expect(popup(page).getByRole("option").first()).toContainText("ДЕНЬ");
  expect(await page.evaluate(() => window.suggestionChanges)).toEqual([]);
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".screenplay-editor p").nth(1)).toContainText(
    "ИНТ. ДОМ — ДЕНЬ",
  );
  await expect(popup(page)).toHaveCount(0);
});
