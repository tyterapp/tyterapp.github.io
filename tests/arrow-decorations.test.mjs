import test from "node:test";
import assert from "node:assert/strict";
import { Schema, Node } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { createArrowDecorations } from "../src/arrow-decorations.js";

const schema = new Schema({ nodes: { doc: { content: "paragraph+" }, paragraph: { content: "text*" }, text: {} } });
const p = (text) => schema.nodes.paragraph.create(null, schema.text(text));
test("arrow styling follows inserted text and removes centering when an arrow becomes a sentence", () => {
  const render = createArrowDecorations();
  let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, [p("←"), p("Look →")]) });
  const before = render(state.doc).find().map(({ from, to, type }) => [from, to, type.attrs.class]);
  assert.deepEqual(before, [[0,3,"script-arrow-row"],[1,2,"script-arrow"],[9,10,"script-arrow"]]);
  state = state.apply(state.tr.insertText("Go ", 1));
  assert.deepEqual(render(state.doc).find().map(({from,to}) => [from,to]), [[4,5],[12,13]]);
});

test("long documents reuse arrow analysis for unchanged paragraphs and selection-only transactions", () => {
  const render = createArrowDecorations();
  let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, Array.from({length:300}, () => p("Text →"))) });
  const first = render(state.doc);
  let scans = 0;
  const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  Object.defineProperty(Node.prototype, "textContent", { configurable: true, get() { if (this.isTextblock) scans++; return descriptor.get.call(this); } });
  try {
    assert.equal(render(state.doc), first);
    state = state.apply(state.tr.insertText("More ", 1));
    assert.equal(render(state.doc).find().length, 300);
  } finally { Object.defineProperty(Node.prototype, "textContent", descriptor); }
  assert.equal(scans, 1);
});
