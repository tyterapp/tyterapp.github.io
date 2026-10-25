import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
async function open(page, language = "en") {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const document = createProject("Character replacement and arrows");
  document.id = "character-arrows";
  document.content.content = [
    paragraph("scene", "INT. HOUSE — DAY", "scene"),
    paragraph("character", "TOMY (V.O.)", "character"),
    paragraph("speech", "Keep this dialogue.", "dialogue"),
    paragraph("action", "", "arrow"),
    paragraph("action", "", "inline-arrow"),
  ];
  document.components = [
    {
      id: "tomy",
      name: "Tomy",
      type: "character",
      thumbnail: image,
      color: "#827393",
    },
    ...["Jeff", "Anna", "Boris", "Nora"].map((name) => ({
      id: name.toLowerCase(),
      name,
      type: "character",
      color: "#827393",
      thumbnail: image,
    })),
    { id: "disabled", name: "Unavailable", type: "character", enabled: false },
    { id: "place", name: "House", type: "place" },
  ];
  await page.addInitScript(
    ({ document, language }) => {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
      localStorage.setItem("tyter.active", document.id);
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.language.v1", language);
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme: language === "en" ? "dark" : "light" }),
      );
    },
    { document, language },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
async function focusBlock(page, id, offset = 0) {
  await page.locator(".screenplay-editor").evaluate(
    (node, { id, offset }) => {
      let at;
      node.editor.state.doc.forEach((block, pos) => {
        if (block.attrs.blockId === id) at = pos + 1 + offset;
      });
      node.editor.chain().focus().setTextSelection(at).run();
    },
    { id, offset },
  );
}

for (const language of ["ru", "en"])
  test(`${language}: an existing character opens all characters and replacement preserves the modifier, dialogue, component definitions and undo`, async ({
    page,
  }, info) => {
    await open(page, language);
    await focusBlock(page, "character", 2);
    const popup = page.getByRole("listbox", {
      name: language === "en" ? "Suggestions" : "Подсказки",
      exact: true,
    });
    const action = popup.getByRole("option", {
      name: language === "en" ? /Change character/ : /Поменять персонажа/,
    });
    await expect(action).toBeVisible();
    expect(await popup.getByRole("option").last().textContent()).toContain(
      language === "en" ? "Change character" : "Поменять персонажа",
    );
    await page.keyboard.press("Control+Enter");
    await expect(popup.getByRole("option")).toHaveCount(5);
    await expect(action).toHaveCount(0);
    await expect(popup).not.toContainText(/Unavailable|House/);
    await expect(popup.locator("img")).toHaveCount(5);
    await popup.getByRole("option", { name: /^Jeff/ }).click();
    await expect(page.locator('[data-block-id="character"]')).toHaveText(
      "JEFF (V.O.)",
    );
    await expect(
      page.locator(
        '[data-block-id="character"] .script-entity[data-entity-id="jeff"]',
      ),
    ).toHaveText("JEFF");
    await expect(page.locator('[data-block-id="dialogue"]')).toHaveText(
      "Keep this dialogue.",
    );
    await page.keyboard.press("Control+z");
    await expect(page.locator('[data-block-id="character"]')).toHaveText(
      "TOMY (V.O.)",
    );
    await focusBlock(page, "character", 2);
    await expect(action).toBeVisible();
    await page.keyboard.press("Shift+ArrowUp");
    await expect(action).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Control+Enter");
    await expect(popup.getByRole("option")).toHaveCount(5);
    await page.screenshot({ path: info.outputPath("change-character.png") });
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(page.locator('[data-block-id="character"]')).toHaveText(
      "TOMY (V.O.)",
    );
  });

test("OpenArrow replaces typed arrows, centers a standalone arrow and keeps the page picker outside the sheet", async ({
  page,
}, info) => {
  await open(page);
  await focusBlock(page, "arrow");
  await page.keyboard.type("->");
  const row = page.locator('[data-block-id="arrow"]');
  await expect(row).toHaveText("→");
  await expect(row).toHaveCSS("text-align", "center");
  await expect(row.locator(".script-arrow")).toHaveCSS(
    "font-family",
    /open-arrow/,
  );
  expect(
    await page.evaluate(async () => {
      await document.fonts.load('16px "open-arrow"', "→");
      return document.fonts.check('16px "open-arrow"', "→");
    }),
  ).toBe(true);
  await focusBlock(page, "inline-arrow");
  await page.keyboard.type("ALPHA -> OMEGA");
  await expect(page.locator('[data-block-id="inline-arrow"]')).toHaveText(
    "ALPHA → OMEGA",
  );
  await expect(page.locator('[data-block-id="inline-arrow"]')).not.toHaveClass(
    /script-arrow-row/,
  );
  const position = await page.evaluate(() => {
    const paper = document.querySelector(".script-paper"),
      picker = paper.querySelector(
        ".page-version-control .script-version-trigger",
      ),
      icon = picker.querySelector("svg"),
      left = icon.getBoundingClientRect(),
      bounds = paper.getBoundingClientRect();
    return {
      gap: left.left - bounds.right,
      background: getComputedStyle(picker).backgroundColor,
    };
  });
  expect(position.gap).toBeCloseTo(16, 0);
  expect(position.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  await page.screenshot({
    path: info.outputPath("open-arrow-and-page-version.png"),
  });
});

for (const language of ["ru", "en"])
  test(`${language}: learning coin explanation uses local Lottie and icons and stays outside the document`, async ({
    page,
  }, info) => {
    await page.route("**/__tyter_local/**", (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.addInitScript((language) => {
      localStorage.setItem("tyter.language.v1", language);
    }, language);
    await page.goto("/free");
    await page
      .getByRole("button", {
        name: language === "en" ? "Help" : "Обучение",
        exact: true,
      })
      .click();
    const intro = page.locator(".editor-first-visit");
    await expect(intro.locator(".editor-first-visit-coins")).toContainText(
      language === "en" ? "100 characters" : "100 символов",
    );
    await expect(intro.locator(".intro-inline-icon")).toHaveCount(3);
    await expect(intro.locator(".intro-flame-player svg")).toBeVisible();
    await page.screenshot({ path: info.outputPath("first-visit-coins.png") });
    await page.locator(".learning-back").click();
    await expect(intro).toHaveCount(0);
    const content = await page
      .locator(".screenplay-editor")
      .evaluate((node) => node.editor.getJSON());
    expect(JSON.stringify(content)).not.toMatch(/монет|coins|100/);
    await expect(page.locator(".screenplay-editor")).toBeVisible();
    await expect(page.locator(".screenplay-editor p").first()).toHaveAttribute(
      "data-format",
      "scene",
    );
  });
