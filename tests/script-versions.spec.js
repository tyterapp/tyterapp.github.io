import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import {
  SCRIPT_VERSIONS,
  scriptScopeId,
  switchScriptVersion,
} from "../src/script-versions.js";
import { libraryFromDocument } from "../src/component-library.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
function fixture() {
  const doc = createProject("Сценарий с версиями");
  doc.id = "script-versions-test";
  doc.content.content = [
    paragraph("scene", "ИНТ. БЕЛЫЙ ДОМ — ДЕНЬ", "scene"),
    paragraph("action", "Белая история.", "action"),
  ];
  doc.components = [
    {
      id: "anna",
      name: "АННА",
      type: "character",
      description: "Исходный персонаж",
    },
  ];
  doc.props = [
    {
      id: "window",
      name: "Окно",
      category: "Objects",
      quantity: 1,
      blockId: "action",
    },
  ];
  doc.comments = [
    {
      id: "white-comment",
      text: "Исходный комментарий",
      quote: "Белая история.",
      blockId: "action",
      createdAt: "2026-10-10T09:00:00Z",
    },
  ];
  doc.outline = {
    columns: [{ id: "act", title: "Акт 1" }],
    cards: [
      {
        id: "card",
        columnId: "act",
        blockId: "scene",
        title: "Белая карточка",
        text: "Белый аутлайн",
        comments: [],
      },
    ],
  };
  doc.sceneVariants = {
    scene: {
      F: [
        paragraph("scene", "ЭКС. САД — НОЧЬ", "scene"),
        paragraph("action", "Скрытая белая сцена.", "f-action"),
      ],
    },
  };
  doc.metadata.formatBarMode = "icons";
  return doc;
}
async function open(page, theme = "light", doc = fixture()) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("script-version-seeded")) return;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      sessionStorage.setItem("script-version-seeded", "yes");
    },
    { doc, theme },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
const choose = (page, id) =>
  selectAppOption(
    page,
    page.getByRole("combobox", {
      name: /^(Версии сценария|Screenplay versions)$/,
    }),
    id,
  );
const stored = (page) =>
  page.evaluate(
    async () =>
      (
        await (
          await import("/src/browser-files.js")
        ).browserRequest("documents")
      ).documents,
  );
async function replaceAction(page, text) {
  await page.locator('p[data-block-id="action"]').evaluate((node) => {
    node.closest("[contenteditable]").focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.insertText(text);
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(text);
}

test("all nine versions deeply isolate content, scene alternatives, comments, libraries, outline, props and settings through validation", () => {
  const original = fixture();
  let doc = validateImport(original);
  for (const version of SCRIPT_VERSIONS) {
    doc = switchScriptVersion(doc, version.id);
    doc.content.content[1].content = [{ type: "text", text: version.label }];
    doc.sceneVariants.scene.F[1].content[0].text = `Scene ${version.id}`;
    doc.outline.cards[0].title = `Card ${version.id}`;
    doc.components[0].description = `Library ${version.id}`;
    doc.components[0].enabled = version.id === "white";
    doc.props[0].quantity = SCRIPT_VERSIONS.indexOf(version) + 1;
    doc.comments[0].text = `Comment ${version.id}`;
    doc.metadata.author = `Author ${version.id}`;
    doc.settings.spellcheck = version.id === "white";
  }
  doc = validateImport(JSON.stringify(doc));
  expect(Object.keys(doc.scriptVersions)).toHaveLength(8);
  const libraryIds = new Set();
  for (const version of SCRIPT_VERSIONS) {
    doc = switchScriptVersion(doc, version.id);
    expect(doc.id).toBe(original.id);
    expect(doc.title).toBe(original.title);
    expect(doc.content.content[1].content[0].text).toBe(version.label);
    expect(doc.sceneVariants.scene.F[1].content[0].text).toBe(
      `Scene ${version.id}`,
    );
    expect(doc.outline.cards[0].title).toBe(`Card ${version.id}`);
    expect(doc.components[0].description).toBe(`Library ${version.id}`);
    expect(doc.components[0].enabled !== false).toBe(version.id === "white");
    expect(doc.props[0].quantity).toBe(SCRIPT_VERSIONS.indexOf(version) + 1);
    expect(doc.comments[0].text).toBe(`Comment ${version.id}`);
    expect(doc.metadata.author).toBe(`Author ${version.id}`);
    expect(doc.settings.spellcheck).toBe(version.id === "white");
    libraryIds.add(libraryFromDocument(doc).id);
  }
  expect(original.content.content[1].content[0].text).toBe("Белая история.");
  expect(libraryIds.size).toBe(9);
  expect(scriptScopeId(original)).toBe(original.id);
  expect(scriptScopeId({ ...original, scriptVersion: "blue" })).not.toBe(
    original.id,
  );
  expect(switchScriptVersion(doc, "unknown")).toBe(doc);
  expect(() =>
    validateImport({
      ...original,
      scriptVersions: { blue: { content: null } },
    }),
  ).toThrow();
});

test("editing, search, outline and an imported component library stay in the selected version after reload and TYT round trip", async ({
  page,
}) => {
  await open(page);
  await choose(page, "blue");
  await expect(page.locator(".minimal-app")).toHaveAttribute(
    "data-script-version",
    "blue",
  );
  await replaceAction(page, "Только синий сюжет.");
  await page.keyboard.press("Control+f");
  await page.getByLabel("Поиск по тексту", { exact: true }).fill("синий");
  await expect(page.locator(".search-result-card")).toHaveCount(1);
  await choose(page, "white");
  await expect(page.locator(".search-drawer")).toHaveCount(0);
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Белая история.",
  );
  await page.keyboard.press("Control+f");
  await page.getByLabel("Поиск по тексту", { exact: true }).fill("синий");
  await expect(page.locator(".search-result-card")).toHaveCount(0);
  await expect(page.locator(".search-count")).toHaveText("Нет совпадений");
  await choose(page, "blue");
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page.locator(".outline-card").click();
  await page
    .getByLabel("Название карточки", { exact: true })
    .fill("Синяя карточка");
  await page
    .getByRole("button", { name: "Закрыть карточку", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Поиск карточек", exact: true })
    .fill("Синяя");
  await choose(page, "white");
  await expect(
    page.getByRole("textbox", { name: "Поиск карточек", exact: true }),
  ).toHaveValue("");
  await expect(page.locator(".outline-card")).toContainText("Белая карточка");
  await choose(page, "blue");
  await expect(page.locator(".outline-card")).toContainText("Синяя карточка");
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await page
    .getByRole("button", { name: "Библиотеки компонентов", exact: true })
    .click();
  const source = createProject("Синяя библиотека");
  source.components = [
    { id: "blue-character", name: "БОРИС", type: "character" },
  ];
  const modal = page.getByRole("dialog", {
    name: "Библиотеки компонентов",
    exact: true,
  });
  await modal.locator('input[type="file"]').setInputFiles({
    name: "blue.tytl",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(libraryFromDocument(source))),
  });
  await modal
    .getByRole("button", { name: "Внедрить в сценарий", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".component-item")).toHaveCount(2);
  await choose(page, "white");
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(page.locator(".component-item")).toHaveCount(1);
  await expect(page.locator(".component-item")).toContainText("АННА");
  await choose(page, "blue");
  await expect
    .poll(async () => {
      const doc = (await stored(page))[0];
      return { version: doc.scriptVersion, components: doc.components.length };
    })
    .toEqual({ version: "blue", components: 2 });
  await page.reload();
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Только синий сюжет.",
  );
  const payload = await page.evaluate(async () => {
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const { switchScriptVersion } = await import("/src/script-versions.js");
    const { browserRequest } = await import("/src/browser-files.js");
    const documents = (await browserRequest("documents")).documents;
    const doc = documents[0];
    const imported = readTYT(await (await exportTYT(doc)).text());
    const white = switchScriptVersion(imported, "white");
    return {
      active: imported.scriptVersion,
      blue: imported.content.content[1].content[0].text,
      white: white.content.content[1].content[0].text,
      blueCards: imported.outline.cards,
      whiteCards: white.outline.cards,
      blueComponents: imported.components,
      whiteComponents: white.components,
      docs: documents.length,
    };
  });
  expect(payload).toMatchObject({
    active: "blue",
    blue: "Только синий сюжет.",
    white: "Белая история.",
    docs: 1,
  });
  expect(payload.blueCards[0].title).toBe("Синяя карточка");
  expect(payload.whiteCards[0].title).toBe("Белая карточка");
  expect(payload.blueComponents).toHaveLength(2);
  expect(payload.blueComponents[1].librarySource).toBeTruthy();
  expect(payload.whiteComponents).toHaveLength(1);
});

test("each version has separate history and undo, with existing White history retained", async ({
  page,
}) => {
  await open(page);
  await replaceAction(page, "Белая история изменена.");
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  await expect(page.locator(".history-card")).toHaveCount(1);
  await choose(page, "blue");
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  await expect(page.locator(".history-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Закрыть историю", exact: true })
    .click();
  await replaceAction(page, "Синяя история изменена.");
  await page.keyboard.press("Control+z");
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Белая история изменена.",
  );
  await page.keyboard.press("Control+y");
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Синяя история изменена.",
  );
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  await expect(page.locator(".history-card")).toHaveCount(1);
  await choose(page, "white");
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Белая история изменена.",
  );
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  await expect(page.locator(".history-card")).toHaveCount(1);
  const rows = await page.evaluate(async () => {
    const { listRevisions } = await import("/src/history.js");
    return (await listRevisions("script-versions-test", Infinity)).map(
      (row) => row.snapshot.scriptVersion,
    );
  });
  expect(rows.sort()).toEqual(["blue", "white"]);
  await page
    .getByRole("button", { name: "Закрыть историю", exact: true })
    .click();
  await page.keyboard.insertText("!");
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Белая история изменена.!",
  );
  await choose(page, "blue");
  await page.keyboard.insertText("?");
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Синяя история изменена.?",
  );
});

test("switching screenplay version from a comment preview restores the working scene letter before copying", async ({
  page,
}) => {
  const doc = fixture();
  doc.sceneVariants.scene.F[1].content[0].marks = [
    { type: "comment", attrs: { id: "f-comment" } },
  ];
  doc.comments.push({
    id: "f-comment",
    text: "Комментарий к F",
    quote: "Скрытая белая сцена.",
    blockId: "f-action",
    sceneId: "scene",
    sceneVariant: "F",
    createdAt: "2026-10-10T10:00:00Z",
  });
  await open(page, "light", doc);
  await page.getByRole("button", { name: "Комментарии", exact: true }).click();
  await page
    .locator(".comment-card")
    .filter({ hasText: "Комментарий к F" })
    .click();
  await expect(page.locator('p[data-block-id="scene"]')).toHaveAttribute(
    "data-scene-variant",
    "F",
  );
  await choose(page, "blue");
  await expect(page.locator('p[data-block-id="scene"]')).toHaveAttribute(
    "data-scene-variant",
    "A",
  );
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Белая история.",
  );
  await choose(page, "white");
  await expect(page.locator('p[data-block-id="scene"]')).toHaveAttribute(
    "data-scene-variant",
    "A",
  );
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Белая история.",
  );
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: all version colours are faint, the menu works with keyboard and the header fits mobile`, async ({
    page,
  }, info) => {
    await open(page, theme);
    const picker = page.getByRole("combobox", {
      name: "Версии сценария",
      exact: true,
    });
    await picker.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(10);
    await expect(
      page.locator(".script-version-trigger > .script-version-swatch"),
    ).toHaveCSS("width", "16px");
    const lastOption = await page.getByRole("option").last().boundingBox();
    const menuBox = await page.getByRole("listbox").boundingBox();
    expect(lastOption.y + lastOption.height).toBeLessThanOrEqual(
      menuBox.y + menuBox.height,
    );
    await page.screenshot({ path: info.outputPath("version-menu.png") });
    await page.keyboard.press("Escape");
    await expect(picker).toBeFocused();
    const colours = [];
    for (const version of SCRIPT_VERSIONS) {
      await choose(page, version.id);
      const colour = await page.locator(".script-paper").evaluate((paper) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d");
        const pixel = (colour) => {
          ctx.fillStyle = colour;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        return {
          background: pixel(getComputedStyle(paper).backgroundColor),
          text: pixel(
            getComputedStyle(paper.querySelector(".screenplay-editor")).color,
          ),
        };
      });
      const luminance = (rgb) =>
        rgb
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((total, v, i) => total + v * [0.2126, 0.7152, 0.0722][i], 0);
      const bg = luminance(colour.background),
        fg = luminance(colour.text);
      expect(
        (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05),
      ).toBeGreaterThan(7);
      if (theme === "light")
        expect(Math.min(...colour.background)).toBeGreaterThan(235);
      else expect(Math.max(...colour.background)).toBeLessThan(65);
      colours.push(colour.background.join(","));
    }
    expect(new Set(colours).size).toBe(9);
    await choose(page, "blue");
    await page.screenshot({ path: info.outputPath("blue-paper.png") });
    await page.setViewportSize({ width: 390, height: 850 });
    const bounds = await picker.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "ENG", exact: true }).click();
    await expect(
      page.getByRole("combobox", { name: "Screenplay versions", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath("mobile-header.png") });
  });
}
