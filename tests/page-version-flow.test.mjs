import test from "node:test";
import assert from "node:assert/strict";
import { Transform } from "@tiptap/pm/transform";
import { EditorState } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import {
  pageVersionLayoutStep,
  pageVersionChanges,
  applyPageVersionChanges,
} from "../src/page-version-history.js";
import { createProject, validateImport } from "../src/data.js";
import {
  ensurePageVersions,
  switchPageVersion,
  mapPageVersionRanges,
  pageVersionSchema as schema,
  pageVersionBreaks,
  selectedPageVersions,
} from "../src/page-versions.js";
import { ensurePageColors, setPageColor } from "../src/page-colors.js";
import { preparePageVersionLayout } from "../src/page-version-layout.js";
const block = (id, text) => ({
  type: "paragraph",
  attrs: { blockId: id, format: "action" },
  content: [{ type: "text", text }],
});
function documentOf(blocks, starts) {
  const doc = createProject("Flow");
  doc.content.content = blocks;
  return ensurePageColors(ensurePageVersions(doc, starts));
}
function edit(doc, from, to, text) {
  const tr = new Transform(schema.nodeFromJSON(doc.content)).replaceWith(
    from,
    to,
    text ? schema.text(text) : [],
  );
  return mapPageVersionRanges(doc, tr.mapping, tr.doc.toJSON());
}
const measure =
  (capacity) =>
  (content, { forcedStarts = [] } = {}) => {
    const size = schema.nodeFromJSON(content).content.size;
    const boundaries = [
      0,
      ...forcedStarts.filter((at) => at > 0 && at < size),
      size,
    ];
    const cuts = [];
    for (let i = 0; i < boundaries.length - 1; i++)
      for (let from = boundaries[i]; from < boundaries[i + 1]; from += capacity)
        cuts.push(from);
    return cuts;
  };
const layout = (doc, capacity) => {
  const measured = measure(capacity);
  return preparePageVersionLayout(
    doc,
    measured(doc.content, {
      forcedStarts: pageVersionBreaks(doc.pageVersions),
    }),
    measured,
  );
};

for (const color of ["white", "blue"]) {
  test(`continuation pages inherit ${color} without creating snapshots`, () => {
    let doc = documentOf([block("story", "Short")], [0]);
    const first = doc.pageVersions.pages[0].id;
    doc = setPageColor(doc, first, color);
    doc = edit(doc, 6, 6, " ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    const content = doc.content;
    doc = layout(doc, 12);
    assert.ok(doc.pageVersions.pages.length >= 3);
    assert.equal(doc.content, content);
    assert.equal(doc.pageVersions.pages[0].id, first);
    assert.ok(
      doc.pageVersions.pages.every(
        (page) => page.active === color && !Object.keys(page.versions).length,
      ),
    );
    assert.deepEqual(pageVersionBreaks(doc.pageVersions), []);
  });
}

test("natural reflow retains the next physical sheet's color and new sheets inherit it", () => {
  let doc = documentOf([block("story", "A".repeat(30))], [0, 16]);
  const second = doc.pageVersions.pages[1].id;
  doc = setPageColor(doc, second, "pink");
  doc = edit(doc, 1, 1, "X".repeat(25));
  doc = layout(doc, 16);
  assert.equal(doc.pageVersions.pages[1].id, second);
  assert.deepEqual(
    doc.pageVersions.pages.map((page) => page.active),
    ["white", "pink", "pink", "pink"],
  );
  assert.equal(
    doc.pageVersions.pages.at(-1).to,
    schema.nodeFromJSON(doc.content).content.size,
  );
});

test("changing color cannot change text, scene alternatives, references or paragraph identity", () => {
  const doc = documentOf([block("story", "A line of screenplay")], [0]);
  doc.sceneVariants = { example: { A: [block("example", "Saved scene")] } };
  const next = setPageColor(doc, doc.pageVersions.pages[0].id, "green");
  assert.equal(next.content, doc.content);
  assert.equal(next.sceneVariants, doc.sceneVariants);
  assert.equal(next.components, doc.components);
  assert.deepEqual(next.pageVersions.pages[0].versions, {});
  assert.equal(setPageColor(next, doc.pageVersions.pages[0].id, "green"), next);
  assert.equal(
    setPageColor(next, doc.pageVersions.pages[0].id, "invalid"),
    next,
  );
});

test("deleting text across pages keeps the first physical sheet's color", () => {
  let doc = documentOf(
    [block("first", "A".repeat(20)), block("second", "B".repeat(20))],
    [0, 22],
  );
  doc = setPageColor(doc, doc.pageVersions.pages[0].id, "blue");
  doc = setPageColor(doc, doc.pageVersions.pages[1].id, "pink");
  const first = doc.pageVersions.pages[0].id;
  doc = edit(doc, 0, schema.nodeFromJSON(doc.content).content.size, "");
  doc = layout(doc, 12);
  assert.equal(doc.pageVersions.pages.length, 1);
  assert.equal(doc.pageVersions.pages[0].id, first);
  assert.equal(doc.pageVersions.pages[0].active, "blue");
});

test("one typing undo restores page boundaries even when earlier keystrokes merged into the same history event", () => {
  let document = documentOf([block("story", "Short")], [0]);
  const original = JSON.stringify(
    schema.nodeFromJSON(document.content).toJSON(),
  );
  let state = EditorState.create({
    doc: schema.nodeFromJSON(document.content),
    plugins: [history()],
  });
  const dispatch = (tr) => {
    state = state.apply(tr);
    document = applyPageVersionChanges(
      mapPageVersionRanges(document, tr.mapping, tr.doc.toJSON()),
      pageVersionChanges(tr),
    );
  };
  dispatch(state.tr.insertText("ABC", 6));
  const beforeLast = document;
  const last = state.tr.insertText("DEFGHIJKLMN", 9);
  dispatch(last);
  const next = layout(document, 12);
  dispatch(
    state.tr
      .step(pageVersionLayoutStep(beforeLast, next))
      .setMeta("appendedTransaction", last),
  );
  assert.equal(document.pageVersions.pages.length, 2);
  assert.equal(undo(state, dispatch), true);
  assert.equal(JSON.stringify(document.content), original);
  assert.equal(document.pageVersions.pages.length, 1);
  assert.equal(document.pageVersions.pages[0].to, state.doc.content.size);
  assert.equal(redo(state, dispatch), true);
  assert.equal(document.pageVersions.pages.length, 2);
  assert.equal(document.pageVersions.pages.at(-1).to, state.doc.content.size);
});
