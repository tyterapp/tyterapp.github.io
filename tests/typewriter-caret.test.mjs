import test from "node:test";
import assert from "node:assert/strict";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import {
  typewriterCaret,
  clampTypewriterPosition,
} from "../src/typewriter-caret.js";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*", attrs: { format: { default: "action" } } },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline" },
  },
  marks: { entity: { attrs: { id: {} } }, link: { attrs: { href: {} } } },
});
const at = (content, position = 1, format = "action") => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", { format }, content),
  ]);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, position),
  });
};
test("caret follows format and extracts the complete word inside or at its end", () => {
  const state = at([schema.text("Hello world")], 4, "speech");
  assert.deepEqual(typewriterCaret(state), {
    format: "speech",
    word: "Hello",
    language: "en",
    linked: false,
    from: 1,
    to: 6,
  });
  assert.equal(
    typewriterCaret(at([schema.text("Привет мир")], 7)).word,
    "Привет",
  );
  assert.equal(
    typewriterCaret(at([schema.text("Hello world")], 7)).word,
    "world",
  );
});
test("links and entities light blue, including the final caret boundary", () => {
  for (const mark of [
    schema.mark("entity", { id: "anna" }),
    schema.mark("link", { href: "https://example.test" }),
  ]) {
    const current = typewriterCaret(at([schema.text("Anna", [mark])], 5));
    assert.equal(current.linked, true);
    assert.equal(current.word, "Anna");
  }
  assert.equal(typewriterCaret(at([schema.text(" ")], 2)).linked, false);
});
test("empty paragraphs are safe and rig coordinates stay within the visible vertical range and rail", () => {
  assert.equal(typewriterCaret(at([])).word, "");
  assert.deepEqual(
    clampTypewriterPosition(
      { x: -5, y: 900 },
      { width: 600, top: 40, bottom: 700 },
    ),
    { x: 32, y: 700 },
  );
  assert.deepEqual(
    clampTypewriterPosition(
      { x: 900, y: 0 },
      { width: 600, top: 40, bottom: 700 },
    ),
    { x: 568, y: 40 },
  );
});

test("word positions stay correct after a hard line break and plain URLs light blue", () => {
  const state = at(
    [schema.text("Hello"), schema.node("hardBreak"), schema.text("Привет")],
    10,
  );
  assert.deepEqual(typewriterCaret(state), {
    format: "action",
    word: "Привет",
    language: "ru",
    linked: false,
    from: 7,
    to: 13,
  });
  assert.equal(
    typewriterCaret(at([schema.text("https://example.test")], 12)).linked,
    true,
  );
});
