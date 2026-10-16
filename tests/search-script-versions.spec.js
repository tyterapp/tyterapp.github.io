import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { scriptSearchMatches } from "../src/document-search.js";
import { switchScriptVersion } from "../src/script-versions.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId, sceneVariant) => ({
  type: "paragraph",
  attrs: { format, blockId, ...(sceneVariant ? { sceneVariant } : {}) },
  content: [{ type: "text", text }],
});
const scene = (letter = "A") =>
  paragraph("scene", "ИНТ. БАШНЯ — ДЕНЬ", "scene", letter);
function fixture(active = "white") {
  let doc = createProject("Поиск по копиям");
  doc.id = "search-script-versions";
  doc.content.content = [
    scene(),
    paragraph("action", "Белый маяк светит.", "target"),
  ];
  doc.sceneVariants = {
    scene: {
      F: [scene("F"), paragraph("action", "Скрытый белый маяк.", "hidden")],
    },
  };
  doc = switchScriptVersion(doc, "blue");
  doc.content.content = [
    scene(),
    ...Array.from({ length: 75 }, (_, index) =>
      paragraph(
        "action",
        `Проход ${index + 1}. ` + "Длинный коридор. ".repeat(5),
        `filler-${index}`,
      ),
    ),
    paragraph("action", "Синий маяк светит далеко.", "target"),
  ];
  doc.sceneVariants = {
    scene: {
      F: [scene("F"), paragraph("action", "Скрытый синий маяк.", "hidden")],
    },
  };
  doc = switchScriptVersion(doc, "pink");
  doc.content.content = [
    scene(),
    paragraph("action", "Розовый маяк светит.", "target"),
  ];
  doc.sceneVariants = {};
  return switchScriptVersion(doc, active);
}
const picker = (page) =>
  page.getByRole("combobox", { name: "Версии сценария", exact: true });
const cards = (page, version) =>
  page.locator(
    `.search-result-card${version ? `[data-script-version="${version}"]` : ""}`,
  );
const toggle = (page) =>
  page.getByRole("switch", { name: "Искать во всех версиях", exact: true });
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("tyter.projects.v1"))[0]);
const coins = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("tyter.writing-timer.v1")).coins,
  );
const caret = (page) =>
  page.locator(".screenplay-editor").evaluate((element) => {
    const { selection } = element.editor.state;
    return {
      blockId: selection.$from.parent.attrs.blockId,
      offset: selection.$from.parentOffset,
      empty: selection.empty,
    };
  });

async function open(
  page,
  { edition = "free", theme = "light", width = 1440 } = {},
) {
  if (edition === "pro") await grantPro(page);
  await page.setViewportSize({ width, height: width < 832 ? 844 : 1000 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("version-search-seeded")) return;
      sessionStorage.setItem("version-search-seeded", "yes");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc: fixture(), theme },
  );
  await page.goto(`/${edition}`);
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
async function search(page, mobile = false) {
  if (mobile) {
    await page
      .getByRole("button", { name: "Открыть инструменты", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Поиск по сценарию", exact: true })
      .click();
  } else await page.keyboard.press("Control+f");
  await expect(
    page.getByLabel("Поиск по тексту", { exact: true }),
  ).toBeVisible();
}

test("all-version search uses live text, stable version/scene order, filters and only existing copies", () => {
  const doc = fixture("blue");
  doc.scriptVersions.blue = {
    content: {
      type: "doc",
      content: [paragraph("action", "Устаревший маяк.", "old")],
    },
  };
  expect(
    scriptSearchMatches(doc, "маяк").map((match) => match.versionId),
  ).toEqual(["blue", "blue"]);
  const matches = scriptSearchMatches(doc, "маяк", "action", true);
  expect(matches.map((match) => [match.versionId, match.variant])).toEqual([
    ["white", "A"],
    ["white", "F"],
    ["blue", "A"],
    ["blue", "F"],
    ["pink", "A"],
  ]);
  expect(matches.map((match) => match.text).join(" ")).not.toContain(
    "Устаревший",
  );
  expect(scriptSearchMatches(doc, "маяк", "scene", true)).toEqual([]);
  expect(scriptSearchMatches(doc, "  ", "all", true)).toEqual([]);
  expect(Object.keys(doc.scriptVersions).sort()).toEqual([
    "blue",
    "pink",
    "white",
  ]);
});

for (const theme of ["light", "dark"])
  test(`${theme}: result cards switch copies and hidden variants, keep the query and place the caret at the scrolled match`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    await page.locator('.screenplay-editor [data-block-id="target"]').click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" Несохранённый хвост.");
    const balance = await coins(page);
    await search(page);
    await expect(toggle(page)).not.toBeChecked();
    await page.getByLabel("Поиск по тексту", { exact: true }).fill("маяк");
    await page
      .getByRole("combobox", { name: "Формат текста", exact: true })
      .selectOption("action");
    await expect(cards(page)).toHaveCount(2);
    await toggle(page).check();
    await expect(cards(page)).toHaveCount(5);
    await expect(picker(page)).toContainText("v1 White");
    await expect(cards(page).locator(".search-version-badge")).toHaveText([
      "v1 White",
      "v1 White",
      "v2 Blue",
      "v2 Blue",
      "v3 Pink",
    ]);
    await page
      .locator(".search-drawer")
      .screenshot({ path: info.outputPath("all-versions.png") });
    await cards(page, "blue").first().click();
    await expect(picker(page)).toContainText("v2 Blue");
    await expect(toggle(page)).toBeChecked();
    await expect(
      page.getByLabel("Поиск по тексту", { exact: true }),
    ).toHaveValue("маяк");
    await expect(
      page.getByRole("combobox", { name: "Формат текста", exact: true }),
    ).toHaveValue("action");
    await expect(page.locator(".screenplay-editor")).toBeFocused();
    await expect
      .poll(() => caret(page))
      .toEqual({ blockId: "target", offset: 6, empty: true });
    await expect
      .poll(() =>
        page
          .locator(
            '.screenplay-editor [data-block-id="target"] .search-from-card',
          )
          .evaluate((node) => {
            const rect = node.getBoundingClientRect();
            const scroll = node
              .closest(".minimal-scroll")
              .getBoundingClientRect();
            return (
              rect.top >= scroll.top &&
              rect.bottom < Math.min(scroll.bottom, window.innerHeight - 90)
            );
          }),
      )
      .toBe(true);
    await expect(cards(page)).toHaveCount(5);
    await page.keyboard.press("Delete");
    await expect(cards(page, "blue")).toHaveCount(1);
    await expect(picker(page)).toContainText("v2 Blue");
    await expect(
      page.locator('.screenplay-editor [data-block-id="scene"]'),
    ).toHaveAttribute("data-scene-variant", "A");
    await expect
      .poll(() => caret(page))
      .toEqual({
        blockId: "target",
        offset: 6,
        empty: true,
      });
    await page.keyboard.press("Control+z");
    await expect(cards(page)).toHaveCount(5);
    await cards(page, "blue").last().click();
    await expect(
      page.locator('.screenplay-editor [data-block-id="scene"]'),
    ).toHaveAttribute("data-scene-variant", "F");
    await expect
      .poll(() => caret(page))
      .toEqual({ blockId: "hidden", offset: 14, empty: true });
    await cards(page, "pink").click();
    await expect(picker(page)).toContainText("v3 Pink");
    await expect
      .poll(() => caret(page))
      .toEqual({ blockId: "target", offset: 8, empty: true });
    expect(await coins(page)).toBe(balance);
    await expect
      .poll(
        async () =>
          JSON.stringify((await stored(page)).scriptVersions?.white?.content) ||
          "",
      )
      .toContain("Несохранённый хвост.");
    await toggle(page).uncheck();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).locator(".search-version-badge")).toHaveCount(0);
    await page
      .getByLabel("Поиск по тексту", { exact: true })
      .fill("Нет такого текста");
    await expect(cards(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Следующее совпадение", exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(picker(page)).toContainText("v3 Pink");
    expect(Object.keys((await stored(page)).scriptVersions).sort()).toEqual([
      "blue",
      "white",
    ]);
  });

test("320px PRO: selecting a copy closes the sheet, reveals the text and focuses its caret; switch translates and works by keyboard", async ({
  page,
}, info) => {
  await open(page, { edition: "pro", theme: "dark", width: 320 });
  await search(page, true);
  await page.getByLabel("Поиск по тексту", { exact: true }).fill("маяк");
  await toggle(page).focus();
  await page.keyboard.press("Space");
  await expect(toggle(page)).toBeChecked();
  const bounds = await toggle(page).locator("..").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  await cards(page, "blue").first().click();
  await expect(page.locator(".mobile-sheet-layer")).toHaveCount(0);
  await expect(picker(page)).toContainText("v2 Blue");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await expect
    .poll(() => caret(page))
    .toEqual({ blockId: "target", offset: 6, empty: true });
  await expect(
    page.locator('.screenplay-editor [data-block-id="target"]'),
  ).toBeInViewport();
  await search(page, true);
  await expect(toggle(page)).toBeChecked();
  await expect(cards(page)).toHaveCount(5);
  await page.screenshot({
    path: info.outputPath("mobile-version-search.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Закрыть поиск", exact: true })
    .click();
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await page.keyboard.press("Control+f");
  await expect(
    page.getByRole("switch", { name: "Search all versions", exact: true }),
  ).toBeChecked();
});
