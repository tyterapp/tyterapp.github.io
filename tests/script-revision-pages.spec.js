import { test, expect } from "@playwright/test";
import { Fragment, Schema, Slice } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { history, undo, redo, closeHistory } from "@tiptap/pm/history";
import { createProject, validateImport } from "../src/data.js";
import {
  switchScriptVersion,
  removeScriptVersion,
  restoreScriptVersion,
} from "../src/script-versions.js";
import {
  pageRevisionColors,
  cleanRevisionStamp,
} from "../src/script-revisions.js";
import { revisionStampPlugin } from "../src/screenplay-revisions.js";
import { pastedScreenplaySlice } from "../src/screenplay-clipboard.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      content: "inline*",
      group: "block",
      attrs: {
        format: { default: "action" },
        blockId: { default: "test" },
        scriptRevision: { default: null },
      },
    },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline" },
  },
  marks: {
    scriptRevision: {
      attrs: { version: { default: "white" }, round: { default: 0 } },
    },
    bold: {},
    comment: {},
  },
});
const p = (text, blockId, format = "action") => ({
  type: "paragraph",
  attrs: { format, blockId },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const stateFor = (content, version = "blue", round = 1) =>
  EditorState.create({
    schema,
    doc: schema.nodeFromJSON(content),
    plugins: [history(), revisionStampPlugin(() => ({ version, round }))],
  });
const starts = (doc) => {
  const positions = [];
  doc.forEach((node, pos) => positions.push(pos));
  return positions;
};
const colors = (state) => pageRevisionColors(state.doc, starts(state.doc));

test("text edits, deletion, formatting and undo revise their own pages without revising comments", () => {
  let state = stateFor({
    type: "doc",
    content: [
      p("First page", "a"),
      p("Second page", "b"),
      p("Third page", "c"),
    ],
  });
  const apply = (tr) => {
    state = state.applyTransaction(tr).state;
  };
  apply(state.tr.insertText("!", starts(state.doc)[1] + 3));
  expect(colors(state)).toEqual(["white", "blue", "white"]);
  expect(undo(state, apply)).toBe(true);
  expect(colors(state)).toEqual(["white", "white", "white"]);
  expect(redo(state, apply)).toBe(true);
  expect(colors(state)).toEqual(["white", "blue", "white"]);
  const third = starts(state.doc)[2] + 1;
  apply(
    closeHistory(state.tr).addMark(
      third,
      third + 2,
      schema.marks.comment.create(),
    ),
  );
  expect(colors(state)).toEqual(["white", "blue", "white"]);
  apply(
    closeHistory(state.tr).addMark(
      third,
      third + 2,
      schema.marks.bold.create(),
    ),
  );
  expect(colors(state)).toEqual(["white", "blue", "blue"]);
  expect(undo(state, apply)).toBe(true);
  expect(colors(state)).toEqual(["white", "blue", "white"]);
  apply(closeHistory(state.tr).delete(third + 1, third + 3));
  expect(colors(state)).toEqual(["white", "blue", "blue"]);
  const silent = stateFor({ type: "doc", content: [p("Unchanged", "a")] });
  expect(
    colors(
      silent.applyTransaction(
        silent.tr.insertText("x", 2).setMeta("preventUpdate", true),
      ).state,
    ),
  ).toEqual(["white"]);
});

test("a change within a paragraph spanning pages colours only that part, including an empty revised block", () => {
  let state = stateFor({ type: "doc", content: [p("a".repeat(800), "long")] });
  state = state.applyTransaction(state.tr.insertText("x", 450)).state;
  expect(pageRevisionColors(state.doc, [0, 200, 400, 600])).toEqual([
    "white",
    "white",
    "blue",
    "white",
  ]);
  state = state.applyTransaction(state.tr.delete(650, 655)).state;
  expect(pageRevisionColors(state.doc, [0, 200, 400, 600])).toEqual([
    "white",
    "white",
    "blue",
    "blue",
  ]);
  let empty = stateFor({ type: "doc", content: [p("x", "empty")] });
  const apply = (tr) => {
    empty = empty.applyTransaction(tr).state;
  };
  apply(empty.tr.delete(1, 2));
  expect(colors(empty)).toEqual(["blue"]);
  undo(empty, apply);
  expect(colors(empty)).toEqual(["white"]);
});

test("copy ancestry, removal, restoration and JSON validation retain mixed page colours", () => {
  const original = createProject("Revision colours");
  original.content = {
    type: "doc",
    content: [p("Original 1", "a"), p("Original 2", "b"), p("Original 3", "c")],
  };
  let document = switchScriptVersion(original, "blue");
  let state = stateFor(document.content, "blue", document.revisionRound);
  state = state.applyTransaction(
    state.tr.insertText(" blue", starts(state.doc)[1] + 3),
  ).state;
  document = { ...document, content: state.doc.toJSON() };
  document = switchScriptVersion(document, "pink");
  expect(document.revisionRound).toBe(2);
  state = stateFor(document.content, "pink", document.revisionRound);
  expect(colors(state)).toEqual(["white", "blue", "white"]);
  state = state.applyTransaction(
    state.tr.insertText(" pink", starts(state.doc)[2] + 3),
  ).state;
  document = validateImport(
    JSON.stringify({ ...document, content: state.doc.toJSON() }),
  );
  expect(colors(stateFor(document.content))).toEqual(["white", "blue", "pink"]);
  const recreated = switchScriptVersion(
    removeScriptVersion(document, "blue").document,
    "blue",
  );
  expect(recreated.revisionRound).toBeGreaterThan(document.revisionRound);
  let newer = stateFor(recreated.content, "blue", recreated.revisionRound);
  newer = newer.applyTransaction(
    newer.tr.insertText(" newer", starts(newer.doc)[2] + 3),
  ).state;
  expect(colors(newer)).toEqual(["white", "blue", "blue"]);
  const deleted = removeScriptVersion(document, "blue");
  document = restoreScriptVersion(deleted.document, "blue", deleted.snapshot, {
    activate: true,
  });
  expect(colors(stateFor(document.content))).toEqual([
    "white",
    "blue",
    "white",
  ]);
  document = switchScriptVersion(document, "white");
  expect(colors(stateFor(document.content))).toEqual([
    "white",
    "white",
    "white",
  ]);
  const invalid = structuredClone(original);
  invalid.content.content[0].content[0].marks = [
    {
      type: "scriptRevision",
      attrs: { version: "url(evil)", round: Infinity },
    },
  ];
  expect(
    validateImport(invalid).content.content[0].content[0].marks,
  ).toBeUndefined();
  expect(cleanRevisionStamp({ version: "blue", round: -1 })).toBeNull();
});

test("newline reparsing, pasted revision metadata and hard-break persistence preserve the intended page colour", () => {
  const lines = Array.from({ length: 4 }, () => "a".repeat(199));
  let state = stateFor({ type: "doc", content: [p(lines.join("\n"), "long")] });
  const converted = [];
  lines.forEach((line, index) => {
    if (index) converted.push(schema.nodes.hardBreak.create());
    converted.push(
      schema.text(
        index === 2 ? `${line.slice(0, 50)}X${line.slice(50)}` : line,
      ),
    );
  });
  state = state.applyTransaction(
    state.tr.replaceWith(1, state.doc.firstChild.content.size + 1, converted),
  ).state;
  expect(pageRevisionColors(state.doc, [0, 200, 400, 600])).toEqual([
    "white",
    "white",
    "blue",
    "white",
  ]);
  state = state.applyTransaction(
    state.tr.insert(220, schema.nodes.hardBreak.create()),
  ).state;
  const document = validateImport({
    ...createProject(),
    content: state.doc.toJSON(),
  });
  expect(
    document.content.content[0].content.some(
      (node) =>
        node.type === "hardBreak" &&
        node.marks?.some(
          (mark) =>
            mark.type === "scriptRevision" && mark.attrs.version === "blue",
        ),
    ),
  ).toBe(true);
  const foreign = schema.nodes.paragraph.create(
    { blockId: "foreign", scriptRevision: { version: "pink", round: 999 } },
    schema.text("Pasted", [
      schema.marks.scriptRevision.create({ version: "pink", round: 999 }),
    ]),
  );
  const slice = pastedScreenplaySlice(new Slice(Fragment.from(foreign), 0, 0));
  let destination = stateFor(
    { type: "doc", content: [p("", "destination")] },
    "blue",
    2,
  );
  destination = destination.applyTransaction(
    destination.tr.replaceSelection(slice),
  ).state;
  expect(JSON.stringify(destination.doc.toJSON())).not.toContain("999");
  expect(colors(destination)).toEqual(["blue"]);
});

function fixture(long = false) {
  const document = createProject("Цвета изменённых страниц");
  document.id = "revision-pages-test";
  document.content.content = [
    p("ИНТ. ДОМ — ДЕНЬ", "scene", "scene"),
    ...(long
      ? [p("Длинный абзац страницы. ".repeat(1800), "long")]
      : [1, 2, 3].map((index) =>
          p(
            Array.from(
              { length: 30 },
              (_, line) => `Лист ${index}, строка ${line + 1}.`,
            ).join("\n"),
            `page-${index}`,
          ),
        )),
  ];
  return document;
}
async function open(
  page,
  { theme = "light", width = 1440, long = false } = {},
) {
  await page.setViewportSize({ width, height: 1000 });
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript(
    ({ document, theme }) => {
      if (sessionStorage.getItem("revision-pages-seeded")) return;
      sessionStorage.setItem("revision-pages-seeded", "yes");
      localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
      localStorage.setItem("tyter.active", document.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { document: fixture(long), theme },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const choose = (page, id) =>
  selectAppOption(
    page,
    page.getByRole("combobox", { name: "Версии сценария", exact: true }),
    id,
  );
const pageColors = (page) =>
  page
    .locator(".revision-page-background")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.revisionColor));
async function writeAtEnd(page, block, text) {
  await page.locator(`[data-block-id="${block}"]`).evaluate((node) => {
    node.closest("[contenteditable]").focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.insertText(text);
}
async function stored(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("tyter.local-files.v1", 1);
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction("files")
            .objectStore("files")
            .get("documents");
          request.onsuccess = () => {
            resolve(
              request.result?.find((doc) => doc.id === "revision-pages-test"),
            );
            db.close();
          };
          request.onerror = () => {
            reject(request.error);
            db.close();
          };
        };
        open.onerror = () => reject(open.error);
      }),
  );
}

for (const theme of ["light", "dark"])
  test(`${theme}: canvas follows the copy while only edited pages inherit revision colours`, async ({
    page,
  }, info) => {
    await open(page, { theme });
    await expect
      .poll(() => pageColors(page))
      .toEqual(["white", "white", "white"]);
    const whiteCanvas = await page
      .locator(".minimal-scroll")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    await choose(page, "blue");
    await expect
      .poll(() => pageColors(page))
      .toEqual(["white", "white", "white"]);
    await expect(page.locator(".minimal-scroll")).not.toHaveCSS(
      "background-color",
      whiteCanvas,
    );
    await writeAtEnd(page, "page-2", " Синяя правка.");
    await expect
      .poll(() => pageColors(page))
      .toEqual(["white", "blue", "white"]);
    await page.keyboard.press("Control+z");
    await expect
      .poll(() => pageColors(page))
      .toEqual(["white", "white", "white"]);
    await page.keyboard.press("Control+Shift+z");
    await expect
      .poll(() => pageColors(page))
      .toEqual(["white", "blue", "white"]);
    await choose(page, "pink");
    await expect
      .poll(() => pageColors(page))
      .toEqual(["white", "blue", "white"]);
    await writeAtEnd(page, "page-3", " Розовая правка.");
    await expect
      .poll(() => pageColors(page))
      .toEqual(["white", "blue", "pink"]);
    const palette = await page.evaluate(() => {
      const context = document.createElement("canvas").getContext("2d");
      const pixel = (color) => {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      return {
        text: pixel(
          getComputedStyle(document.querySelector(".screenplay-editor")).color,
        ),
        page: pixel(
          getComputedStyle(
            document.querySelector('[data-revision-color="blue"]'),
          ).backgroundColor,
        ),
        canvas: pixel(
          getComputedStyle(document.querySelector(".minimal-scroll"))
            .backgroundColor,
        ),
      };
    });
    const luminance = (rgb) =>
      rgb
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce(
          (total, v, index) => total + v * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    const contrast = (a, b) =>
      (Math.max(luminance(a), luminance(b)) + 0.05) /
      (Math.min(luminance(a), luminance(b)) + 0.05);
    expect(contrast(palette.text, palette.page)).toBeGreaterThan(7);
    expect(contrast(palette.canvas, palette.page)).toBeGreaterThan(1.15);
    await expect
      .poll(async () =>
        (await stored(page))?.content.content
          .find((node) => node.attrs.blockId === "page-3")
          ?.content.map((part) => part.text || "\n")
          .join(""),
      )
      .toContain("Розовая правка.");
    await page.reload();
    await expect
      .poll(() => pageColors(page))
      .toEqual(["white", "blue", "pink"]);
    await page
      .locator(".minimal-scroll")
      .evaluate((node) => node.scrollTo(0, 1056));
    await page.screenshot({ path: info.outputPath("mixed-page-colours.png") });
    await choose(page, "blue");
    await expect
      .poll(() => pageColors(page))
      .toEqual(["white", "blue", "white"]);
    await choose(page, "white");
    await expect
      .poll(() => pageColors(page))
      .toEqual(["white", "white", "white"]);
    await expect(page.locator(".minimal-scroll")).toHaveCSS(
      "background-color",
      whiteCanvas,
    );
  });

test("mobile uses the same logical page colours and resizing does not create revisions", async ({
  page,
}, info) => {
  await open(page, { width: 320, theme: "dark" });
  await choose(page, "blue");
  await expect
    .poll(() => pageColors(page))
    .toEqual(["white", "white", "white"]);
  await writeAtEnd(page, "page-2", " Правка.");
  await expect.poll(() => pageColors(page)).toEqual(["white", "blue", "white"]);
  await page.screenshot({ path: info.outputPath("mobile-revision.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(() => pageColors(page)).toEqual(["white", "blue", "white"]);
  await page.setViewportSize({ width: 832, height: 1000 });
  await expect.poll(() => pageColors(page)).toEqual(["white", "blue", "white"]);
});

test("typing in a long paragraph revises its current page rather than the entire paragraph", async ({
  page,
}) => {
  await open(page, { long: true });
  await choose(page, "blue");
  await expect
    .poll(async () => (await pageColors(page)).length)
    .toBeGreaterThan(4);
  await page.locator(".screenplay-editor").evaluate((node) => {
    const editor = node.editor;
    const gap = node.querySelectorAll(".screenplay-page-break")[1];
    const position = editor.view.posAtDOM(gap, 0) + 10;
    editor.commands.setTextSelection(position);
    editor.view.focus();
  });
  await page.keyboard.insertText("X");
  await expect
    .poll(
      async () =>
        (await pageColors(page)).filter((color) => color === "blue").length,
    )
    .toBe(1);
  expect((await pageColors(page))[2]).toBe("blue");
});

test("native IME composition keeps its text once and revises only the edited page", async ({
  page,
  context,
}) => {
  await open(page);
  await choose(page, "blue");
  await writeAtEnd(page, "page-2", "");
  const text = () =>
    page.locator(".screenplay-editor").evaluate((element) => {
      const paragraph = element.editor.state.doc.child(2);
      return paragraph.textBetween(0, paragraph.content.size, "\n", "\n");
    });
  const before = await text();
  const session = await context.newCDPSession(page);
  await session.send("Input.imeSetComposition", {
    text: "ni",
    selectionStart: 2,
    selectionEnd: 2,
  });
  await session.send("Input.imeSetComposition", {
    text: "你好",
    selectionStart: 2,
    selectionEnd: 2,
  });
  await session.send("Input.insertText", { text: "你好" });
  await expect.poll(text).toBe(before + "你好");
  await expect.poll(() => pageColors(page)).toEqual(["white", "blue", "white"]);
  await page.keyboard.press("Control+z");
  await expect.poll(text).toBe(before);
  await expect
    .poll(() => pageColors(page))
    .toEqual(["white", "white", "white"]);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(text).toBe(before + "你好");
  await expect.poll(() => pageColors(page)).toEqual(["white", "blue", "white"]);
});
