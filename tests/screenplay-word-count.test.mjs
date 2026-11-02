import test from "node:test";
import assert from "node:assert/strict";
import { Node, Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import * as activity from "../src/writing-activity.js";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*" },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline" },
  },
  marks: { bold: {} },
});

test("cached screenplay word totals preserve inline marks, hyphens and hard breaks", () => {
  assert.equal(typeof activity.screenplayWordCount, "function");
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, [
      schema.text("one-two café’s hel"),
      schema.text("lo", [schema.marks.bold.create()]),
    ]),
    schema.nodes.paragraph.create(null, [schema.text("12"), schema.nodes.hardBreak.create(), schema.text("34")]),
  ]);
  assert.equal(activity.screenplayWordCount(doc), 5);
});

test("typing computes word totals from one changed paragraph without serializing the entire screenplay", () => {
  assert.equal(typeof activity.screenplayWordCount, "function");
  const paragraphs = Array.from({ length: 300 }, () => schema.nodes.paragraph.create(null, schema.text("one two")));
  let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, paragraphs) });
  assert.equal(activity.screenplayWordCount(state.doc), 600);
  state = state.apply(state.tr.insertText("extra ", 1));
  const original = Node.prototype.toJSON;
  let documents = 0, blocks = 0;
  Node.prototype.toJSON = function () {
    if (this.type.name === "doc") documents++;
    if (this.type.name === "paragraph") blocks++;
    return original.call(this);
  };
  try {
    assert.equal(activity.screenplayWordCount(state.doc), 601);
    assert.equal(activity.screenplayWordCount(state.doc), 601);
  } finally {
    Node.prototype.toJSON = original;
  }
  assert.equal(documents, 0);
  assert.equal(blocks, 1);
});
