import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

async function open(
  page,
  { pro = false, language = "ru", theme = "light", width = 1440 } = {},
) {
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  if (pro) await grantPro(page);
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  const document = createProject("Полноэкранный режим");
  document.id = "fullscreen-theme";
  document.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "scene" },
      content: [{ type: "text", text: "ИНТ. ДОМ — ДЕНЬ" }],
    },
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "action" },
      content: [{ type: "text", text: "Анна открывает окно." }],
    },
  ];
  await page.addInitScript(
    ({ document, language, theme }) => {
      if (sessionStorage.getItem("focus-theme-seed")) return;
      sessionStorage.setItem("focus-theme-seed", "yes");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
      localStorage.setItem("tyter.active", document.id);
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.editor-intro.v1", "seen");
      localStorage.setItem("tyter.language.v1", language);
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { document, language, theme },
  );
  await page.goto(pro ? "/pro" : "/free");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const editorState = (page) =>
  page.locator(".screenplay-editor").evaluate((element) => ({
    content: element.editor.getJSON(),
    selection: element.editor.state.selection.toJSON(),
  }));
const noFormatting = async (page) =>
  expect(
    page.locator(".screenplay-format-bar, .focus-format-hint"),
  ).toHaveCount(0);
async function ordered(page, minimum = 40) {
  const selectors = [
    ".scroll-top-button",
    ".focus-theme-button",
    ".focus-telegraph-button",
    ".focus-typewriter-button",
    ".focus-mode-toggle",
  ];
  const boxes = await page.locator(selectors.join(",")).evaluateAll(
    (elements, selectors) =>
      selectors.map((selector) => {
        const rect = elements
          .find((element) => element.matches(selector))
          .getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    selectors,
  );
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].width).toBeGreaterThanOrEqual(minimum);
    expect(boxes[i].height).toBeGreaterThanOrEqual(minimum);
    expect(boxes[i].x).toBeGreaterThanOrEqual(0);
    expect(boxes[i].x + boxes[i].width).toBeLessThanOrEqual(
      page.viewportSize().width,
    );
    expect(boxes[i].x).toBeGreaterThanOrEqual(
      boxes[i - 1].x + boxes[i - 1].width,
    );
    // The hidden scroll-to-top button has its own 6px entrance offset.
    if (i > 1) expect(boxes[i].y).toBeCloseTo(boxes[i - 1].y, 0);
  }
}

for (const settings of [
  { pro: false, language: "ru", theme: "light" },
  { pro: true, language: "en", theme: "dark" },
])
  test(`${settings.language} ${settings.theme}: fullscreen hides formatting and theme switches preserve the caret, shortcuts and saved preference`, async ({
    page,
  }, info) => {
    await open(page, settings);
    const editor = page.locator(".screenplay-editor");
    await expect(page.locator(".screenplay-format-bar")).toBeVisible();
    await expect(page.locator(".focus-theme-button")).toHaveCount(0);
    await editor.locator('[data-block-id="action"]').click();
    await page.keyboard.press("End");
    const before = await editorState(page);
    await page.locator(".focus-mode-toggle").click();
    await noFormatting(page);
    await ordered(page);
    const toggle = page.locator(".focus-theme-button");
    const next = settings.theme === "dark" ? "light" : "dark";
    const label =
      settings.language === "en"
        ? "Switch to light theme"
        : "Включить тёмную тему";
    await expect(toggle).toHaveAccessibleName(label);
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", next);
    expect(await editorState(page)).toEqual(before);
    await page.screenshot({ path: info.outputPath(`fullscreen-${next}.png`) });
    await page.locator(".focus-telegraph-button").click();
    await expect(page.locator(".telegraph-key")).toBeVisible();
    await ordered(page);
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      settings.theme,
    );
    await expect(page.locator(".telegraph-key")).toBeVisible();
    expect(await editorState(page)).toEqual(before);
    await toggle.click();
    await editor.focus();
    await page.keyboard.press("Control+3");
    await expect(editor.locator('[data-block-id="action"]')).toHaveAttribute(
      "data-format",
      "character",
    );
    await page.keyboard.press("Control+2");
    await expect(editor.locator('[data-block-id="action"]')).toHaveAttribute(
      "data-format",
      "action",
    );
    await noFormatting(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".screenplay-format-bar")).toBeVisible();
    await expect(toggle).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-theme", next);
    await page.reload();
    await expect(editor).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", next);
    await page.locator(".focus-mode-toggle").click();
    await noFormatting(page);
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      String(next === "dark"),
    );
    expect((await editorState(page)).content).toEqual(before.content);
  });

test.describe("touch fullscreen theme", () => {
  test.use({ hasTouch: true, reducedMotion: "reduce" });
  test("320px: theme is left of the telegraph, touch targets do not overlap, and controls stay accessible with the telegraph open", async ({
    page,
  }, info) => {
    await open(page, { width: 320 });
    await page.locator(".screenplay-editor").blur();
    await page.locator(".focus-mode-toggle").tap();
    await noFormatting(page);
    await ordered(page, 44);
    const before = await editorState(page);
    await page.locator(".focus-theme-button").tap();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.locator(".focus-telegraph-button").tap();
    await expect(page.locator(".telegraph-key")).toBeVisible();
    await ordered(page, 44);
    await page.locator(".focus-theme-button").tap();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".focus-theme-icon").first()).toHaveCSS(
      "transition-duration",
      "0s",
    );
    expect((await editorState(page)).content).toEqual(before.content);
    await page.screenshot({ path: info.outputPath("fullscreen-mobile.png") });
    await page.locator(".focus-mode-toggle").tap();
    await expect(page.locator(".screenplay-format-bar")).toHaveCount(0);
    await page.locator(".screenplay-editor").click();
    await page.keyboard.insertText("Ввод ");
    await expect(page.locator(".screenplay-format-bar")).toBeVisible();
  });
});
