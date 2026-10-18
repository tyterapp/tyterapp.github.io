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
import { preparePageVersionLayout } from "../src/page-version-layout.js";
const block = (id, text) => ({
  type: "paragraph",
  attrs: { blockId: id, format: "action" },
  content: [{ type: "text", text }],
});
function documentOf(blocks, starts) {
  const doc = createProject("Flow");
  doc.content.content = blocks;
  return ensurePageVersions(doc, starts);
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

for (const version of ["white", "blue"]) {
  test(`new continuation pages inherit ${version} and own no copies of the previous page`, () => {
    let doc = documentOf([block("story", "Short")], [0]);
    const first = doc.pageVersions.pages[0].id;
    if (version !== "white") doc = switchPageVersion(doc, first, version);
    const saved = JSON.stringify(doc.pageVersions.pages[0].versions);
    doc = edit(doc, 6, 6, " ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    const content = JSON.stringify(doc.content);
    doc = layout(doc, 12);
    const pages = doc.pageVersions.pages.filter((page) => page.to > page.from);
    assert.ok(pages.length >= 3);
    assert.equal(pages[0].id, first);
    assert.equal(JSON.stringify(pages[0].versions), saved);
    assert.ok(pages.every((page) => page.active === version));
    assert.ok(
      pages
        .slice(1)
        .every((page) => page.flow && !Object.keys(page.versions).length),
    );
    assert.equal(new Set(pages.map((page) => page.id)).size, pages.length);
    assert.equal(JSON.stringify(doc.content), content);
    assert.deepEqual(
      validateImport(doc).pageVersions.pages.map((page) => page.flow),
      pages.map((page) => page.flow),
    );
    assert.equal(layout(doc, 12), doc);
  });
}

test("overflow goes to the existing next selected version, then new pages inherit that version", () => {
  let doc = documentOf(
    [block("first", "First page"), block("second", "Second page")],
    [0, 12],
  );
  const [first, second] = doc.pageVersions.pages;
  doc = switchPageVersion(doc, first.id, "blue");
  doc = switchPageVersion(doc, second.id, "pink");
  const inactive = JSON.stringify(doc.pageVersions.pages[1].versions);
  doc = edit(doc, 6, 6, "NEW-TEXT-0123456789");
  const content = JSON.stringify(doc.content);
  doc = layout(doc, 12);
  const pages = doc.pageVersions.pages.filter((page) => page.to > page.from);
  assert.equal(pages[1].id, second.id);
  assert.equal(pages[1].active, "pink");
  assert.equal(pages[1].from, 12);
  assert.ok(
    selectedPageVersions(
      doc,
    )[1].source.content.content[0].content[0].text.includes("012345"),
  );
  assert.equal(JSON.stringify(pages[1].versions), inactive);
  assert.ok(
    pages
      .slice(2)
      .every(
        (page) => page.active === "pink" && !Object.keys(page.versions).length,
      ),
  );
  assert.equal(JSON.stringify(doc.content), content);
});

test("overflow stops at a short next page; later selected copies keep their text and boundary", () => {
  let doc = documentOf(
    [
      block("first", "A".repeat(98)),
      block("second", "B".repeat(48)),
      block("third", "C".repeat(18)),
    ],
    [0, 100, 150],
  );
  const [first, second, third] = doc.pageVersions.pages;
  doc = switchPageVersion(doc, first.id, "blue");
  doc = switchPageVersion(doc, second.id, "pink");
  doc = switchPageVersion(doc, third.id, "green");
  doc = edit(doc, 5, 5, "0123456789");
  doc = layout(doc, 100);
  assert.equal(doc.pageVersions.pages.length, 3);
  assert.deepEqual(
    doc.pageVersions.pages.map((page) => [page.active, page.from, page.to]),
    [
      ["blue", 0, 100],
      ["pink", 100, 160],
      ["green", 160, 180],
    ],
  );
  assert.equal(doc.pageVersions.pages[2].id, third.id);
  assert.equal(doc.content.content[2].content[0].text, "C".repeat(18));
  doc = edit(doc, 5, 15, "");
  doc = layout(doc, 100);
  assert.deepEqual(
    doc.pageVersions.pages.map((page) => [page.active, page.from, page.to]),
    [
      ["blue", 0, 100],
      ["pink", 100, 150],
      ["green", 150, 170],
    ],
  );
});

test("selecting a page version keeps a short copy separate until overflow reaches it again", () => {
  let doc = documentOf([block("first", "A".repeat(38))], [0]);
  doc = layout(doc, 20);
  const second = doc.pageVersions.pages[1].id;
  doc = switchPageVersion(doc, second, "blue");
  const from = doc.pageVersions.pages[1].from;
  assert.deepEqual(pageVersionBreaks(doc.pageVersions), [from]);
  const last = doc.pageVersions.pages[1].to;
  doc = edit(doc, from, last - 1, "B");
  doc = layout(doc, 20);
  assert.equal(doc.pageVersions.pages[1].id, second);
  assert.equal(doc.pageVersions.pages[1].active, "blue");
  assert.equal(doc.pageVersions.pages[1].from, from);
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
