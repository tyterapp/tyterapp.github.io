import { test, expect } from "@playwright/test";
import { Transform } from "@tiptap/pm/transform";
import { createProject, validateImport } from "../src/data.js";
import {
  ensurePageVersions,
  mapPageVersionRanges,
  pageVersionSchema,
  switchPageVersion,
} from "../src/page-versions.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

test.setTimeout(60000);
const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});
function replaceText(document, blockId, text) {
  const node = pageVersionSchema.nodeFromJSON(document.content);
  let range;
  node.forEach((block, pos) => {
    if (block.attrs.blockId === blockId)
      range = { from: pos + 1, to: pos + block.nodeSize - 1 };
  });
  const transaction = new Transform(node).replaceWith(
    range.from,
    range.to,
    pageVersionSchema.text(text),
  );
  return mapPageVersionRanges(
    document,
    transaction.mapping,
    transaction.doc.toJSON(),
  );
}
function fixture() {
  let document = createProject("Постраничные версии");
  document.id = "page-versions-ui";
  const first = [
    paragraph("scene", "ИНТ. БАШНЯ — ДЕНЬ", "scene-1"),
    paragraph("action", "Белый маяк на первой странице.", "target-1"),
    ...Array.from({ length: 9 }, (_, i) =>
      paragraph(
        "action",
        `Первый этаж ${i + 1}. Тихий коридор ведёт к лестнице.`,
        `first-${i}`,
      ),
    ),
  ];
  const second = [
    paragraph("scene", "ЭКС. БЕРЕГ — НОЧЬ", "scene-2"),
    paragraph("action", "Белый маяк на второй странице.", "target-2"),
    ...Array.from({ length: 9 }, (_, i) =>
      paragraph(
        "action",
        `Вторая часть ${i + 1}. Волны разбиваются о камни у берега.`,
        `second-${i}`,
      ),
    ),
  ];
  document.content.content = [...first, ...second];
  const firstSize = pageVersionSchema.nodeFromJSON({
    type: "doc",
    content: first,
  }).content.size;
  document = ensurePageVersions(document, [0, firstSize]);
  const [page1, page2] = document.pageVersions.pages;
  document = switchPageVersion(document, page1.id, "blue");
  document = replaceText(
    document,
    "target-1",
    "Синий маяк на первой странице.",
  );
  document = switchPageVersion(document, page2.id, "pink");
  return replaceText(document, "target-2", "Розовый маяк на второй странице.");
}

async function open(
  page,
  { theme = "dark", width = 1440, document = fixture() } = {},
) {
  await grantPro(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ document, theme }) => {
      if (!sessionStorage.getItem("page-versions-seed")) {
        sessionStorage.setItem("page-versions-seed", "done");
        localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
        localStorage.setItem("tyter.active", document.id);
        localStorage.setItem("tyter.onboarding.v1", "done");
        localStorage.setItem("tyter.language.v1", "ru");
        localStorage.setItem(
          "tyter.editor-preferences.v1",
          JSON.stringify({ theme }),
        );
      }
      window.savedPageCopies = [];
      window.showSaveFilePicker = async () => ({
        createWritable: async () => ({
          write: async (blob) =>
            window.savedPageCopies.push(JSON.parse(await blob.text())),
          close: async () => {},
        }),
      });
    },
    { document, theme },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect(
    width < 832
      ? page.locator(".mobile-page-version-bar")
      : picker(
          page,
          document.pageVersions?.pages.filter((page) => page.to > page.from)
            .length || 1,
        ),
  ).toBeVisible();
}
const picker = (page, number) =>
  page.getByRole("combobox", {
    name: `Версия страницы ${number}`,
    exact: true,
  });
const choose = (page, number, version) =>
  selectAppOption(page, picker(page, number), version);
const cards = (page, number, version) =>
  page.locator(
    `.search-result-card${number ? `[data-page-number="${number}"]` : ""}${version ? `[data-script-version="${version}"]` : ""}`,
  );
const caret = (page) =>
  page.locator(".screenplay-editor").evaluate((node) => ({
    blockId: node.editor.state.selection.$from.parent.attrs.blockId,
    at: node.editor.state.selection.$from.parentOffset,
    empty: node.editor.state.selection.empty,
  }));
const text = (page, id) =>
  page.locator(`.screenplay-editor [data-block-id="${id}"]`);

for (const theme of ["light", "dark"]) {
  test(`canvas stays neutral when the caret changes page versions in ${theme} theme`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    const app = page.locator(".minimal-app");
    const canvas = page.locator(".minimal-scroll");
    const sheets = page.locator(".revision-page-background");
    const sheetColours = () =>
      sheets.evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).backgroundColor),
      );

    await choose(page, 1, "white");
    await text(page, "target-1").click();
    await expect(app).toHaveAttribute("data-script-version", "white");
    const neutralCanvas = await canvas.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    );
    await choose(page, 1, "blue");
    await text(page, "target-1").click();
    await expect(app).toHaveAttribute("data-script-version", "blue");
    await expect(canvas).toHaveCSS("background-color", neutralCanvas);
    const colours = await sheetColours();
    expect(colours).toHaveLength(2);
    expect(colours[0]).not.toBe(colours[1]);
    expect(colours.every((colour) => colour !== "rgba(0, 0, 0, 0)")).toBe(true);

    await text(page, "target-2").click();
    await expect(app).toHaveAttribute("data-script-version", "pink");
    await expect(canvas).toHaveCSS("background-color", neutralCanvas);
    expect(await sheetColours()).toEqual(colours);
    await page.screenshot({
      path: info.outputPath(`neutral-canvas-${theme}.png`),
    });
  });
}

test("page pickers isolate edits and retain the mixed selection after reload and TYT copy", async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByRole("combobox", { name: "Версии сценария", exact: true }),
  ).toHaveCount(0);
  await expect(picker(page, 1)).toContainText("v2 Blue");
  await expect(picker(page, 2)).toContainText("v3 Pink");
  await expect(
    picker(page, 1).locator('[data-version-shape="blue"]'),
  ).toHaveCount(1);
  await expect(text(page, "target-1")).toHaveText(
    "Синий маяк на первой странице.",
  );
  await expect(text(page, "target-2")).toHaveText(
    "Розовый маяк на второй странице.",
  );
  await choose(page, 1, "white");
  await expect(text(page, "target-1")).toHaveText(
    "Белый маяк на первой странице.",
  );
  await expect(picker(page, 2)).toContainText("v3 Pink");
  await choose(page, 1, "blue");
  await text(page, "target-1").click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Свежая правка.");
  await expect(text(page, "target-1")).toHaveText(
    "Синий маяк на первой странице. Свежая правка.",
  );
  await choose(page, 2, "white");
  await expect(text(page, "target-1")).toContainText("Свежая правка.");
  await expect(text(page, "target-2")).toHaveText(
    "Белый маяк на второй странице.",
  );
  await page.keyboard.press("Control+Shift+s");
  await expect
    .poll(() => page.evaluate(() => window.savedPageCopies.length))
    .toBe(1);
  const payload = await page.evaluate(() => window.savedPageCopies[0]);
  expect(payload).toMatchObject({ format: "tyter", version: 1 });
  const restored = validateImport(payload.document);
  expect(restored.pageVersions.pages.map(({ active }) => active)).toEqual([
    "blue",
    "white",
  ]);
  expect(JSON.stringify(restored.content)).toContain("Свежая правка.");
  expect(restored.pageVersions.pages[0].versions.white).toBeTruthy();
  expect(restored.pageVersions.pages[1].versions.pink).toBeTruthy();
  await page.reload();
  await expect(picker(page, 1)).toContainText("v2 Blue");
  await expect(picker(page, 2)).toContainText("v1 White");
  await expect(text(page, "target-1")).toContainText("Свежая правка.");
  await choose(page, 2, "pink");
  await expect(text(page, "target-2")).toHaveText(
    "Розовый маяк на второй странице.",
  );
  await expect(text(page, "target-1")).toContainText("Свежая правка.");
});

test("search cards show page colour and geometry; selecting a result changes only that page and focuses its text", async ({
  page,
}, info) => {
  await open(page, { theme: "light" });
  await page.keyboard.press("Control+f");
  const query = page.getByLabel("Поиск по тексту", { exact: true });
  await query.fill("маяк");
  await expect(cards(page)).toHaveCount(2);
  await expect(
    cards(page, 1, "blue").locator(".search-result-page"),
  ).toHaveText("Стр. 1");
  await expect(
    cards(page, 2, "pink").locator(".search-version-badge"),
  ).toHaveText("v3 Pink");
  const allVersions = page.getByRole("switch", {
    name: "Искать во всех версиях",
    exact: true,
  });
  await allVersions.check();
  await expect(cards(page)).toHaveCount(4);
  for (const [number, version] of [
    [1, "white"],
    [1, "blue"],
    [2, "white"],
    [2, "pink"],
  ])
    await expect(
      cards(page, number, version).locator(`[data-version-shape="${version}"]`),
    ).toHaveCount(1);
  await cards(page, 1, "white").click();
  await expect(picker(page, 1)).toContainText("v1 White");
  await expect(picker(page, 2)).toContainText("v3 Pink");
  await expect
    .poll(() => caret(page))
    .toEqual({ blockId: "target-1", at: 6, empty: true });
  await cards(page, 2, "white").click();
  await expect(picker(page, 1)).toContainText("v1 White");
  await expect(picker(page, 2)).toContainText("v1 White");
  await expect
    .poll(() => caret(page))
    .toEqual({ blockId: "target-2", at: 6, empty: true });
  await expect(text(page, "target-2")).toBeInViewport();
  await expect(query).toHaveValue("маяк");
  await expect(allVersions).toBeChecked();
  await expect(cards(page)).toHaveCount(4);
  await cards(page, 1, "blue").click();
  await expect(picker(page, 2)).toContainText("v1 White");
  await expect(text(page, "target-1")).toHaveText(
    "Синий маяк на первой странице.",
  );
  await expect
    .poll(() => caret(page))
    .toEqual({ blockId: "target-1", at: 6, empty: true });
  await page
    .locator(".search-drawer")
    .screenshot({ path: info.outputPath("page-version-search.png") });
});

test("all-version search drops removed pages immediately and after reload while keeping versions of current pages", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press("Control+f");
  const query = page.getByLabel("Поиск по тексту", { exact: true });
  const allVersions = page.getByRole("switch", {
    name: "Искать во всех версиях",
    exact: true,
  });
  await query.fill("маяк");
  await allVersions.check();
  await expect(cards(page)).toHaveCount(4);
  await text(page, "target-2").click();
  await page.locator(".screenplay-editor").evaluate((node) => {
    const { editor } = node;
    let from;
    editor.state.doc.forEach((block, position) => {
      if (block.attrs.blockId === "scene-2") from = position;
    });
    editor.commands.setTextSelection({
      from,
      to: editor.state.doc.content.size,
    });
  });
  await page.keyboard.press("Backspace");
  await expect(picker(page, 2)).toHaveCount(0);
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page, 1, "blue")).toHaveCount(1);
  await expect(cards(page, 1, "white")).toHaveCount(1);
  await query.fill("второй");
  await expect(cards(page)).toHaveCount(0);

  await expect(page.locator('.save-status [role="status"]')).toHaveText(
    "Сохранено на устройстве",
  );
  await page.reload();
  await expect(picker(page, 1)).toBeVisible();
  await page.keyboard.press("Control+f");
  await query.fill("маяк");
  await allVersions.check();
  await expect(cards(page)).toHaveCount(2);
  await query.fill("второй");
  await expect(cards(page)).toHaveCount(0);
});

test("overflowing the first page flows into the existing second page's selected version", async ({
  page,
}) => {
  await open(page);
  const originalFirstId = await page
    .locator('.page-version-control[data-page-number="1"]')
    .getAttribute("data-page-version-id");
  const originalSecondId = await page
    .locator('.page-version-control[data-page-number="2"]')
    .getAttribute("data-page-version-id");
  const originalSecondText = await text(page, "target-2").textContent();
  const before = await page
    .locator(".screenplay-editor")
    .evaluate((node) => node.editor.getJSON());
  await text(page, "target-1").click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(
    " Дополнительный текст для новой страницы.".repeat(160),
  );
  await expect
    .poll(() => page.locator(".page-version-control").count())
    .toBeGreaterThan(2);
  await expect(text(page, "target-2")).toHaveText(originalSecondText);
  await expect(
    page.locator(
      `.page-version-control[data-page-version-id="${originalFirstId}"]`,
    ),
  ).toHaveCount(1);
  const preservedSecond = page.locator(
    `.page-version-control[data-page-version-id="${originalSecondId}"]`,
  );
  await expect(preservedSecond).toHaveCount(1);
  await expect
    .poll(async () =>
      Number(await preservedSecond.getAttribute("data-page-number")),
    )
    .toBe(2);
  await expect(preservedSecond.getByRole("combobox")).toContainText("v3 Pink");
  await page.keyboard.press("Control+Shift+s");
  await expect
    .poll(() => page.evaluate(() => window.savedPageCopies.length))
    .toBe(1);
  const payload = await page.evaluate(() => window.savedPageCopies[0]);
  const pages = payload.document.pageVersions.pages;
  expect(pages.length).toBeGreaterThan(2);
  expect(pages.findIndex(({ id }) => id === originalSecondId)).toBe(1);
  expect(pages.find(({ id }) => id === originalSecondId).active).toBe("pink");
  expect(
    pages
      .slice(2)
      .every(
        (page) => page.active === "pink" && !Object.keys(page.versions).length,
      ),
  ).toBe(true);
  expect(JSON.stringify(payload.document.content)).toContain(
    originalSecondText,
  );
  const after = await page
    .locator(".screenplay-editor")
    .evaluate((node) => node.editor.getJSON());
  await page.locator(".screenplay-editor").press("Control+z");
  await expect
    .poll(() =>
      page
        .locator(".screenplay-editor")
        .evaluate((node) => node.editor.getJSON()),
    )
    .toEqual(before);
  await expect(page.locator(".page-version-control")).toHaveCount(2);
  await expect(picker(page, 2)).toContainText("v3 Pink");
  await expect(preservedSecond).toHaveAttribute("data-page-number", "2");
  await page.locator(".screenplay-editor").press("Control+Shift+z");
  await expect
    .poll(() =>
      page
        .locator(".screenplay-editor")
        .evaluate((node) => node.editor.getJSON()),
    )
    .toEqual(after);
  await expect(page.locator(".page-version-control")).toHaveCount(
    pages.filter((page) => page.to > page.from).length,
  );
  await expect(preservedSecond).toHaveAttribute("data-page-number", "2");
});

for (const [version, width] of [
  ["white", 1440],
  ["blue", 320],
]) {
  test(`${width}px: new pages inherit ${version}, own independent copies, and typing undo/redo preserves the text`, async ({
    page,
  }) => {
    const document = createProject("Новые страницы");
    document.content.content = [
      paragraph("scene", "ИНТ. КОМНАТА — ДЕНЬ", "heading"),
      paragraph("action", "Начало строки. ", "story"),
    ];
    await open(page, { document, width });
    if (version !== "white") await choose(page, 1, version);
    const editor = page.locator(".screenplay-editor");
    await text(page, "story").click();
    await page.keyboard.press("End");
    const before = await editor.evaluate((node) => node.editor.getJSON());
    const continuation = "Продолжение одного абзаца без потери текста. ".repeat(
      190,
    );
    await page.keyboard.insertText(continuation.slice(0, 300));
    await page.keyboard.insertText(continuation.slice(300));
    await expect
      .poll(() => page.locator(".revision-page-background").count())
      .toBeGreaterThan(2);
    const after = await editor.evaluate((node) => node.editor.getJSON());
    expect(
      after.content[1].content.map((part) => part.text || "").join(""),
    ).toBe("Начало строки. " + continuation);
    await page.keyboard.press("Control+Shift+s");
    await expect
      .poll(() => page.evaluate(() => window.savedPageCopies.length))
      .toBe(1);
    const saved = await page.evaluate(() => window.savedPageCopies[0].document);
    const pages = saved.pageVersions.pages.filter(
      (page) => page.to > page.from,
    );
    expect(pages.every((page) => page.active === version)).toBe(true);
    expect(
      pages.slice(1).every((page) => !Object.keys(page.versions).length),
    ).toBe(true);
    expect(new Set(pages.map((page) => page.id)).size).toBe(pages.length);
    await editor.press("Control+z");
    await expect
      .poll(() => editor.evaluate((node) => node.editor.getJSON()))
      .toEqual(before);
    await expect(page.locator(".revision-page-background")).toHaveCount(1);
    await editor.press("Control+Shift+z");
    await expect
      .poll(() => editor.evaluate((node) => node.editor.getJSON()))
      .toEqual(after);
    await expect
      .poll(() => page.locator(".revision-page-background").count())
      .toBe(pages.length);
    await expect(page.locator('.save-status [role="status"]')).toHaveText(
      "Сохранено на устройстве",
    );
    await page.reload();
    await expect
      .poll(() => editor.evaluate((node) => node.editor.getJSON()))
      .toEqual(after);
    await expect
      .poll(() => page.locator(".revision-page-background").count())
      .toBe(pages.length);
  });
}

test("320px: page and version controls fit the screen and switch only the chosen page", async ({
  page,
}, info) => {
  await open(page, { width: 320, theme: "light" });
  const bar = page.locator(".mobile-page-version-bar");
  await expect(picker(page, 1)).toContainText("v2 Blue");
  await bar.getByRole("combobox", { name: "Страница", exact: true }).click();
  await page.getByRole("option", { name: "Страница 2", exact: true }).click();
  await expect(picker(page, 2)).toContainText("v3 Pink");
  await choose(page, 2, "green");
  await expect(picker(page, 2)).toContainText("v5 Green");
  await expect(text(page, "target-2")).toContainText("Розовый маяк");
  await expect.poll(async () => (await caret(page)).blockId).toBe("scene-2");
  const box = await bar.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(
    await page
      .locator(".minimal-scroll")
      .evaluate((node) => node.scrollWidth - node.clientWidth),
  ).toBe(0);
  for (const button of await bar.getByRole("combobox").all())
    expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Control+Shift+s");
  await expect
    .poll(() => page.evaluate(() => window.savedPageCopies.length))
    .toBe(1);
  const versions = await page.evaluate(() =>
    window.savedPageCopies[0].document.pageVersions.pages.map(
      ({ active }) => active,
    ),
  );
  expect(versions).toEqual(["blue", "green"]);
  await page.screenshot({ path: info.outputPath("page-versions-mobile.png") });
});
