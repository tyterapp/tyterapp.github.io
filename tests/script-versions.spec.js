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
      name: /^(Версия страницы 1|Page 1 version)$/,
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

// Document-wide UI expectations are archived in legacy; page versions keep shared project data.
test("page alternatives isolate text while outline and imported components remain shared after reload and TYT round trip", async ({
  page,
}) => {
  await open(page);
  await choose(page, "blue");
  await replaceAction(page, "Только синий сюжет.");
  await choose(page, "white");
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Белая история.",
  );
  await page.getByRole("button", { name: "Аутлайн", exact: true }).click();
  await page.locator(".outline-card").click();
  await page
    .getByLabel("Название карточки", { exact: true })
    .fill("Общая карточка");
  await page
    .getByRole("button", { name: "Закрыть карточку", exact: true })
    .click();
  await page.getByRole("button", { name: "Сценарий", exact: true }).click();
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await page
    .getByRole("button", { name: "Библиотеки компонентов", exact: true })
    .click();
  const source = createProject("Общая библиотека");
  source.components = [{ id: "boris", name: "БОРИС", type: "character" }];
  const modal = page.getByRole("dialog", {
    name: "Библиотеки компонентов",
    exact: true,
  });
  await modal.locator('input[type="file"]').setInputFiles({
    name: "shared.tytl",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(libraryFromDocument(source))),
  });
  await modal
    .getByRole("button", { name: "Внедрить в сценарий", exact: true })
    .click();
  await expect(page.locator(".component-item")).toHaveCount(2);
  await choose(page, "blue");
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Только синий сюжет.",
  );
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(page.locator(".component-item")).toHaveCount(2);
  await page.evaluate(() => window.dispatchEvent(new Event("tyter:save-now")));
  await expect
    .poll(async () => (await stored(page))[0]?.pageVersions?.pages[0]?.active)
    .toBe("blue");
  await page.reload();
  await expect(page.locator('p[data-block-id="action"]')).toHaveText(
    "Только синий сюжет.",
  );
  const payload = await page.evaluate(async () => {
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const { switchPageVersion } = await import("/src/page-versions.js");
    const { browserRequest } = await import("/src/browser-files.js");
    const documents = (await browserRequest("documents")).documents;
    const imported = readTYT(await (await exportTYT(documents[0])).text());
    const white = switchPageVersion(
      imported,
      imported.pageVersions.pages[0].id,
      "white",
    );
    return {
      active: imported.pageVersions.pages[0].active,
      blue: imported.content.content[1].content
        .map((part) => part.text || "\n")
        .join(""),
      white: white.content.content[1].content
        .map((part) => part.text || "\n")
        .join(""),
      cards: white.outline.cards,
      components: white.components,
      docs: documents.length,
    };
  });
  expect(payload).toMatchObject({
    active: "blue",
    blue: "Только синий сюжет.",
    white: "Белая история.",
    docs: 1,
  });
  expect(payload.cards[0].title).toBe("Общая карточка");
  expect(payload.components).toHaveLength(2);
  expect(payload.components[1].librarySource).toBeTruthy();
});
