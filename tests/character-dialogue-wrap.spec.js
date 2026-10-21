import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";

const character = "ОченьДлинноеИмяПерсонажаWithoutSpaces".repeat(8);
const scene = "ИНТ. " + "ДлинноеНазваниеСценыWithoutSpaces".repeat(12);
const speech =
  "НепрерывнаяРепликаWithoutSpaces".repeat(30) + "\nВторая строка с пробелами.";
const aside = "(" + "ДлиннаяРемаркаWithoutSpaces".repeat(12) + ")";
const block = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});

async function assertFits(page) {
  const overflowing = await page
    .locator(
      [
        ".character-dialogue-content",
        ".character-dialogue-heading",
        ".character-dialogue-card",
        ".character-dialogue-scene",
        ".character-dialogue-card h3",
        ".character-dialogue-card p",
      ].join(","),
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          width: element.clientWidth,
          content: element.scrollWidth,
        })),
    );
  expect(overflowing).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBe(0);
  // Check actual text fragments as well: a hidden overflow must not mask the bug.
  const outside = await page
    .locator(".character-dialogue-card")
    .evaluateAll((cards) =>
      cards.flatMap((card) => {
        const bounds = card.getBoundingClientRect();
        const nodes = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        const overflow = [];
        while (nodes.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(nodes.currentNode);
          if (
            [...range.getClientRects()].some(
              (rect) =>
                rect.left < bounds.left - 1 || rect.right > bounds.right + 1,
            )
          )
            overflow.push(nodes.currentNode.textContent.slice(0, 50));
        }
        return overflow;
      }),
    );
  expect(outside).toEqual([]);
}

for (const [width, theme] of [
  [2200, "dark"],
  [1440, "light"],
  [320, "dark"],
])
  test(`${width}px ${theme}: long names, scene links, asides and dialogue wrap fully inside cards and character navigation still works`, async ({
    page,
  }, info) => {
    await page.route("**/__tyter_local/**", (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
    const doc = createProject("Перенос реплик");
    doc.content.content = [
      block("scene", scene, "scene"),
      block("character", character, "character"),
      block("parenthetical", aside, "aside"),
      block("speech", speech, "speech"),
      block("scene", "ЭКС. САД — ДЕНЬ", "scene-2"),
      block("character", "АННА", "anna"),
      block("speech", "Обычная реплика остаётся читаемой.", "anna-speech"),
    ];
    await page.addInitScript(
      ({ doc, theme }) => {
        localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
        localStorage.setItem("tyter.active", doc.id);
        localStorage.setItem("tyter.language.v1", "ru");
        localStorage.setItem("tyter.onboarding.v1", "done");
        localStorage.setItem("tyter.editor-intro.v1", "seen");
        localStorage.setItem(
          "tyter.editor-preferences.v1",
          JSON.stringify({ theme }),
        );
      },
      { doc, theme },
    );
    await page.goto("/free");
    const editor = page.locator(".screenplay-editor");
    await expect(editor).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const before = await editor.evaluate((element) => element.editor.getJSON());
    if (width < 832)
      await page
        .getByRole("button", { name: "Открыть инструменты", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Реплики персонажей", exact: true })
      .click();
    const view = page.getByRole("main", {
      name: "Реплики персонажа",
      exact: true,
    });
    await expect(view.locator("article")).toHaveCount(2);
    await expect(view.locator("article h3").first()).toHaveText(character);
    await expect(view.locator(".parenthetical").first()).toHaveText(aside);
    await expect(view.locator(".speech").first()).toHaveText(speech);
    await expect(view.locator(".speech").first()).toHaveCSS(
      "white-space",
      "pre-wrap",
    );
    await assertFits(page);
    const nav = view.getByRole("navigation", { name: "Персонажи сценария" });
    await nav
      .getByRole("button")
      .filter({ hasText: character.toUpperCase() })
      .click();
    await expect(view.locator("article")).toHaveCount(1);
    await expect(view.locator("h2")).toHaveText(character.toUpperCase());
    await assertFits(page);
    await page.screenshot({
      path: info.outputPath(`dialogue-wrap-${width}-${theme}.png`),
    });
    await view.locator(".character-dialogue-scene").click();
    await expect(view).toHaveCount(0);
    await expect(editor).toBeVisible();
    expect(
      await editor.evaluate((element) => element.editor.getJSON()),
    ).toEqual(before);
    await expect(editor.locator('[data-block-id="character"]')).toHaveAttribute(
      "data-outline-navigation-target",
      "true",
    );
  });
