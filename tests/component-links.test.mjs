import test from "node:test";
import assert from "node:assert/strict";
import { Schema, Node } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { componentLinksPlugin, componentLinksKey } from "../src/component-links.js";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", group: "block" },
    text: { group: "inline" },
  },
  marks: {
    entity: {
      attrs: { id: {}, color: { default: "#8a799a" }, automatic: { default: false } },
    },
  },
});
const paragraph = (text) => schema.nodes.paragraph.create(null, schema.text(text));
const links = (state) => {
  const result = [];
  state.doc.descendants((node, pos) => {
    for (const mark of node.marks)
      if (mark.type.name === "entity") result.push({ text: node.text, id: mark.attrs.id, pos });
  });
  return result;
};

test("automatic links rescan only changed paragraphs while retaining links after positions shift", () => {
  const components = [{ id: "anna", name: "Анна", aliases: ["Анну"] }];
  let state = EditorState.create({
    schema,
    doc: schema.nodes.doc.create(null, Array.from({ length: 300 }, () => paragraph("Анна ждёт Анну."))),
    plugins: [componentLinksPlugin(() => components)],
  });
  state = state.applyTransaction(state.tr.setMeta(componentLinksKey, true)).state;
  let scanned = 0;
  const original = Node.prototype.textBetween;
  Node.prototype.textBetween = function (...args) {
    if (this.type.name === "paragraph") scanned++;
    return original.apply(this, args);
  };
  try {
    state = state.applyTransaction(state.tr.insertText("А", 2)).state;
  } finally {
    Node.prototype.textBetween = original;
  }
  assert.ok(scanned <= 2, `one edited paragraph rescanned ${scanned} paragraphs`);
  const actual = links(state);
  assert.equal(actual.length, 599);
  assert.deepEqual(actual.slice(0, 2).map(({ text }) => text), ["Анну", "Анна"]);
  assert.equal(actual.at(-1).id, "anna");
});

test("changing component definitions refreshes previously unchanged paragraphs", () => {
  let components = [{ id: "anna", name: "Анна" }];
  let state = EditorState.create({
    schema,
    doc: schema.nodes.doc.create(null, [paragraph("Анна и Борис."), paragraph("Анна ждёт.")]),
    plugins: [componentLinksPlugin(() => components)],
  });
  state = state.applyTransaction(state.tr.setMeta(componentLinksKey, true)).state;
  assert.equal(links(state).length, 2);
  components = [{ id: "boris", name: "Борис" }];
  state = state.applyTransaction(state.tr.setMeta(componentLinksKey, true)).state;
  assert.deepEqual(links(state).map(({ text, id }) => ({ text, id })), [{ text: "Борис", id: "boris" }]);
});
