import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

test.describe.configure({ mode: "default" });
const formats = [
  "scene",
  "action",
  "character",
  "speech",
  "parenthetical",
  "transition",
  "plain",
];
const texts = [
  "ИНТ. ДОМ — ДЕНЬ",
  "Она смело входит.",
  "АННА",
  "Привет, мир.",
  "(тихо)",
  "ЗАТЕМНЕНИЕ:",
  "Заметка автора.",
];
const p = (format, text, id) => ({
  type: "paragraph",
  attrs: { format, blockId: id },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
function fixture() {
  const source = createProject("Исходный сценарий");
  source.id = "clipboard-source";
  source.content.content = [
    p("action", "", "before"),
    ...formats.map((format, i) => p(format, texts[i], `source-${format}`)),
    p("action", "", "after"),
    p("speech", "До: ", "inline-target"),
  ];
  source.content.content[2].content = [
    { type: "text", text: "Она " },
    {
      type: "text",
      text: "смело",
      marks: [{ type: "bold" }, { type: "italic" }, { type: "underline" }],
    },
    { type: "text", text: " входит." },
  ];
  source.content.content[4].content[0].marks = [{ type: "italic" }];
  const target = createProject("Другой сценарий");
  target.id = "clipboard-target";
  target.content.content = [p("action", "", "target")];
  return [source, target];
}
async function open(page, context) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript((docs) => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem("tyter.projects.v1", JSON.stringify(docs));
    localStorage.setItem("tyter.active", docs[0].id);
    localStorage.setItem("tyter.language.v1", "ru");
  }, fixture());
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
const block = (page, id) =>
  page.locator(`.screenplay-editor p[data-block-id="${id}"]`);
async function select(page, first, last = first, substring) {
  await page.locator(".screenplay-editor").evaluate(
    (editor, { first, last, substring }) => {
      const textNodes = (id) => {
        const walker = document.createTreeWalker(
          editor.querySelector(`[data-block-id="${id}"]`),
          NodeFilter.SHOW_TEXT,
        );
        const result = [];
        let node;
        while ((node = walker.nextNode()))
          if (!node.parentElement.closest(".ProseMirror-widget"))
            result.push(node);
        return result;
      };
      const starts = textNodes(first),
        ends = textNodes(last);
      editor.focus();
      const range = document.createRange();
      if (substring) {
        const node = starts.find((n) => n.textContent.includes(substring));
        const at = node.textContent.indexOf(substring);
        range.setStart(node, at);
        range.setEnd(node, at + substring.length);
      } else {
        range.setStart(starts[0], 0);
        range.setEnd(ends.at(-1), ends.at(-1).textContent.length);
      }
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    },
    { first, last, substring },
  );
  await page.keyboard.press("Shift");
}
async function otherDocument(page) {
  await page.getByRole("button", { name: "Документы", exact: true }).click();
  await page
    .locator(".document-item")
    .filter({ hasText: "Другой сценарий" })
    .click();
  await expect(block(page, "target")).toBeVisible();
  await block(page, "target").click();
}
async function menuAction(page, id, action) {
  await block(page, id).click({ button: "right" });
  const item = page.getByRole("menuitem", { name: action });
  await expect(item).toBeEnabled();
  await item.click();
  await expect(
    page.getByRole("menu", { name: "Действия с текстом" }),
  ).toHaveCount(0);
}
async function paragraphs(page) {
  return page.locator(".screenplay-editor p").evaluateAll((nodes) =>
    nodes.map((node) => {
      const copy = node.cloneNode(true);
      copy.querySelectorAll(".ProseMirror-widget").forEach((n) => n.remove());
      return {
        text: copy.textContent,
        format: node.dataset.format,
        id: node.dataset.blockId,
      };
    }),
  );
}
test("keyboard copying a whole scene preserves its format when pasted before the original", async ({
  page,
  context,
}) => {
  await open(page, context);
  await select(page, "source-scene");
  await page.keyboard.press("Control+c");
  await block(page, "before").click();
  await page.keyboard.press("Control+v");
  const scenes = (await paragraphs(page)).filter((p) => p.text === texts[0]);
  expect(scenes.map((p) => p.format)).toEqual(["scene", "scene"]);
  expect(new Set(scenes.map((p) => p.id)).size).toBe(2);
  await expect(block(page, "source-scene")).toContainText(texts[0]);
  await page.keyboard.press("Control+z");
  expect(
    (await paragraphs(page)).filter((p) => p.text === texts[0]),
  ).toHaveLength(1);
});
for (const [copy, paste] of [
  ["keyboard", "keyboard"],
  ["menu", "keyboard"],
  ["keyboard", "menu"],
  ["menu", "menu"],
])
  test(`${copy} copy and ${paste} paste preserve every block format and inline marks in another document`, async ({
    page,
    context,
  }) => {
    await open(page, context);
    await select(page, "source-scene", "source-plain");
    if (copy === "keyboard") await page.keyboard.press("Control+c");
    else await menuAction(page, "source-action", "Копировать");
    await otherDocument(page);
    if (paste === "keyboard") await page.keyboard.press("Control+v");
    else await menuAction(page, "target", "Вставить");
    await expect(page.locator(".screenplay-editor")).toContainText(
      texts.at(-1),
    );
    const rows = (await paragraphs(page)).filter((p) => p.text);
    expect(rows.map((p) => p.format)).toEqual(formats);
    expect(rows.map((p) => p.text)).toEqual(texts);
    expect(new Set(rows.map((p) => p.id)).size).toBe(formats.length);
    await expect(page.locator(".screenplay-editor strong em u")).toHaveText(
      "смело",
    );
    await expect(
      page.locator('.screenplay-editor p[data-format="speech"] em'),
    ).toHaveText(texts[3]);
  });
test("copying an inline fragment keeps emphasis and the destination paragraph's format", async ({
  page,
  context,
}) => {
  await open(page, context);
  await select(page, "source-action", "source-action", "смело");
  await page.keyboard.press("Control+c");
  await block(page, "inline-target").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+v");
  await expect(block(page, "inline-target")).toHaveAttribute(
    "data-format",
    "speech",
  );
  await expect(block(page, "inline-target")).toHaveText("До: смело");
  await expect(block(page, "inline-target").locator("strong em u")).toHaveText(
    "смело",
  );
});

test("a fragment at the beginning of a block stays inline and native fallback also copies formats", async ({
  page,
  context,
}) => {
  await open(page, context);
  await select(page, "source-scene", "source-scene", "ИНТ.");
  await page.keyboard.press("Control+c");
  await block(page, "inline-target").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+v");
  await expect(block(page, "inline-target")).toHaveText("До: ИНТ.");
  await expect(block(page, "inline-target")).toHaveAttribute(
    "data-format",
    "speech",
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "write", {
      value: undefined,
      configurable: true,
    });
  });
  await select(page, "source-scene");
  await menuAction(page, "source-scene", "Копировать");
  await otherDocument(page);
  await page.keyboard.press("Control+v");
  expect(
    (await paragraphs(page)).filter((p) => p.text).map((p) => p.format),
  ).toEqual(["scene"]);
});

test("a clipped character block uses its source format when pasted into an empty line", async ({
  page,
  context,
}) => {
  await open(page, context);
  await select(page, "source-character", "source-character", "АН");
  await page.keyboard.press("Control+c");
  await otherDocument(page);
  await page.keyboard.press("Control+v");
  expect((await paragraphs(page)).filter((p) => p.text)).toMatchObject([
    { text: "АН", format: "character" },
  ]);
});
test("cutting and pasting through the menu retains block formats; plain paste remains available", async ({
  page,
  context,
}) => {
  await open(page, context);
  await select(page, "source-character", "source-parenthetical");
  await menuAction(page, "source-character", "Вырезать");
  await otherDocument(page);
  await menuAction(page, "target", "Вставить");
  expect(
    (await paragraphs(page)).filter((p) => p.text).map((p) => p.format),
  ).toEqual(["character", "speech", "parenthetical"]);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+Shift+v");
  await expect(page.locator(".screenplay-editor em")).toHaveCount(0);
  await expect(page.locator(".screenplay-editor")).toContainText(
    "Привет, мир.",
  );
});
