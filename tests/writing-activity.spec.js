import { test, expect } from "@playwright/test";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import {
  committedCharacters,
  writtenCharacters,
} from "../src/writing-activity.js";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
  marks: { strong: {} },
});
const state = () => EditorState.create({ schema, plugins: [history()] });

test("writing rewards count Unicode insertions and replacements, but never undo, redo or formatting", () => {
  let editor = state();
  const insert = editor.tr.insertText("a".repeat(99) + "😺");
  expect(writtenCharacters(insert)).toBe(100);
  editor = editor.apply(insert);
  expect(
    writtenCharacters(editor.tr.addMark(1, 4, schema.marks.strong.create())),
  ).toBe(0);
  expect(writtenCharacters(editor.tr.insertText("новый", 1, 4))).toBe(5);
  expect(writtenCharacters(editor.tr.delete(1, 4))).toBe(0);
  let transaction;
  undo(editor, (tr) => {
    transaction = tr;
  });
  expect(writtenCharacters(transaction)).toBe(0);
  editor = editor.apply(transaction);
  redo(editor, (tr) => {
    transaction = tr;
  });
  expect(writtenCharacters(transaction)).toBe(0);
  expect(
    writtenCharacters(
      editor.tr.insertText("snapshot").setMeta("preventUpdate", true),
    ),
  ).toBe(0);
  expect(
    writtenCharacters(
      editor.tr
        .insertText("generated heading")
        .setMeta("skipWritingReward", true),
    ),
  ).toBe(0);
});

test("provisional mobile IME text earns no coins; only committed Unicode text is counted", () => {
  let editor = state();
  const composition = {};
  let credited = 0;
  for (const [text, from, to] of [
    ["a", 1, 1],
    ["ab", 1, 2],
    ["", 1, 3],
    ["abc", 1, 1],
  ]) {
    const tr = editor.tr.insertText(text, from, to).setMeta("composition", 7);
    credited += writtenCharacters(tr, composition);
    editor = editor.apply(tr);
  }
  expect(credited).toBe(0);
  expect(committedCharacters("猫😺")).toBe(2);
  expect(committedCharacters("")).toBe(0);
  expect(
    writtenCharacters(
      editor.tr.insertText("romanized".repeat(20)).setMeta("composition", 8),
    ),
  ).toBe(0);
});

test("editor accrues coins without a timer, carries the remainder through reload and ignores undo/redo and scene switches", async ({
  page,
}) => {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("Награды за текст");
  doc.id = "writing-rewards";
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "scene" },
      content: [{ type: "text", text: "ИНТ. КАФЕ — ДЕНЬ" }],
    },
    { type: "paragraph", attrs: { format: "action", blockId: "body" } },
  ];
  doc.sceneVariants = { scene: { F: doc.content.content } };
  await page.addInitScript((doc) => {
    if (sessionStorage.getItem("rewards-seeded")) return;
    sessionStorage.setItem("rewards-seeded", "yes");
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.language.v1", "ru");
    localStorage.setItem("tyter.onboarding.v1", "done");
  }, doc);
  const wallet = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("tyter.writing-timer.v1")),
    );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await expect.poll(async () => (await wallet())?.coins).toBe(1);
  await expect(
    page.getByRole("button", { name: "Доктор сценария", exact: true }),
  ).toHaveCount(0);
  await page.locator('[data-block-id="body"]').click();
  await page.keyboard.insertText("a".repeat(99));
  await expect.poll(async () => (await wallet())?.writing?.characters).toBe(99);
  expect((await wallet()).coins).toBe(1);
  await page.keyboard.insertText("😺");
  await expect.poll(async () => (await wallet())?.coins).toBe(11);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+y");
  expect((await wallet()).writing.characters).toBe(100);
  await page.keyboard.insertText("b".repeat(50));
  await expect
    .poll(async () => (await wallet())?.writing?.characters)
    .toBe(150);
  await page.evaluate(() => window.dispatchEvent(new Event("tyter:save-now")));
  await page.reload();
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  expect((await wallet()).coins).toBe(11);
  expect((await wallet()).writing.characters).toBe(150);
  await page
    .getByRole("combobox", { name: "Вариант сцены 1", exact: true })
    .click();
  await page.getByRole("option", { name: "F", exact: true }).click();
  expect((await wallet()).writing.characters).toBe(150);
  await page.locator('[data-block-id="body"]').click();
  await page.keyboard.insertText("c".repeat(50));
  await expect.poll(async () => (await wallet())?.coins).toBe(21);
  const editor = page.locator(".screenplay-editor");
  await editor.evaluate((dom) => {
    dom.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
    );
    dom.querySelector('[data-block-id="body"]').textContent =
      "romanized".repeat(20);
    dom.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertCompositionText",
      }),
    );
  });
  await expect(page.locator('[data-block-id="body"]')).toContainText(
    "romanized",
  );
  expect((await wallet()).writing.characters).toBe(200);
  await editor.evaluate((dom) => {
    dom.querySelector('[data-block-id="body"]').textContent = "猫";
    dom.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "猫" }),
    );
  });
  await expect
    .poll(async () => (await wallet())?.writing?.characters)
    .toBe(201);
  expect((await wallet()).coins).toBe(21);
});
