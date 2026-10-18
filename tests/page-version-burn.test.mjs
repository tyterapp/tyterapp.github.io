import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@tiptap/pm/state";
import { history, undo, redo, closeHistory } from "@tiptap/pm/history";
import { createProject, validateImport } from "../src/data.js";
import {
  pageVersionSchema as schema,
  ensurePageVersions,
  switchPageVersion,
  rebasePageVersionContent,
  mapPageVersionRanges,
  burnPageVersion,
  selectedPageVersions,
} from "../src/page-versions.js";
import { scriptSearchMatches } from "../src/document-search.js";
import {
  pageVersionStateStep,
  pageVersionChanges,
  applyPageVersionChanges,
} from "../src/page-version-history.js";

const paragraph = (id, text, format = "action") => ({
  type: "paragraph",
  attrs: { blockId: id, format },
  content: [{ type: "text", text }],
});
function fixture(neighbour = false) {
  let doc = createProject("Version burn");
  doc.content.content = [
    paragraph("first", "White version", "scene"),
    ...(neighbour ? [paragraph("neighbour", "Neighbour text", "scene")] : []),
  ];
  doc = ensurePageVersions(
    doc,
    neighbour ? [0, "White version".length + 2] : [0],
  );
  const id = doc.pageVersions.pages[0].id;
  for (const version of ["blue", "pink"]) {
    doc = switchPageVersion(doc, id, version);
    const content = structuredClone(doc.content);
    content.content[0].content[0].text = `${version} version`;
    doc = rebasePageVersionContent(doc, content);
  }
  return doc;
}

for (const active of ["white", "blue"]) {
  test(`burning ${active} removes only that first-page version and selects a saved alternative`, () => {
    let doc = fixture(true);
    const [page, neighbour] = doc.pageVersions.pages;
    doc = switchPageVersion(doc, page.id, active);
    const before = JSON.stringify(doc);
    const next = burnPageVersion(doc, page.id);
    const result = next.pageVersions.pages[0];
    assert.equal(result.id, page.id);
    assert.equal(result.active, active === "white" ? "blue" : "white");
    assert.equal(result.versions[active], undefined);
    assert.ok(result.versions.pink);
    assert.equal(next.pageVersions.pages[1].id, neighbour.id);
    assert.equal(next.content.content.at(-1).content[0].text, "Neighbour text");
    assert.equal(
      scriptSearchMatches(
        next,
        active === "white" ? "White version" : "blue version",
        "all",
        true,
      ).length,
      0,
    );
    const restored = validateImport(next);
    assert.equal(restored.pageVersions.pages[0].active, result.active);
    assert.equal(restored.pageVersions.pages[0].versions[active], undefined);
    assert.equal(JSON.stringify(doc), before);
  });
}

test("a page with no alternatives is removed; the only remaining version resets to a fresh White scene", () => {
  let doc = createProject("Last version");
  doc.content.content = [
    paragraph("first", "First"),
    paragraph("last", "Last"),
  ];
  doc = ensurePageVersions(doc, [0, 7]);
  const first = doc.pageVersions.pages[0].id;
  doc = burnPageVersion(doc, doc.pageVersions.pages[1].id);
  assert.equal(selectedPageVersions(doc).length, 1);
  assert.equal(doc.content.content[0].content[0].text, "First");
  doc.pageVersions.pages[0].active = "blue";
  doc = burnPageVersion(doc, first);
  assert.equal(doc.pageVersions.pages[0].active, "white");
  assert.deepEqual(doc.pageVersions.pages[0].versions, {});
  assert.deepEqual(
    doc.content.content.map((block) => block.attrs.format),
    ["scene", "action"],
  );
  assert.ok(doc.content.content.every((block) => !block.content?.length));
});

test("burning a split paragraph keeps its neighbour's prefix and restores the saved tail", () => {
  let doc = createProject("Shared paragraph");
  doc.content.content = [paragraph("shared", "Prefix 012345 white tail")];
  doc = ensurePageVersions(doc, [0, 15]);
  const id = doc.pageVersions.pages[1].id;
  doc = switchPageVersion(doc, id, "blue");
  const content = structuredClone(doc.content);
  content.content[0].content[0].text = "Prefix 012345 blue tail";
  doc = rebasePageVersionContent(doc, content);
  const next = burnPageVersion(doc, id);
  assert.equal(
    next.content.content[0].content[0].text,
    "Prefix 012345 white tail",
  );
  assert.equal(next.content.content[0].attrs.blockId, "shared");
  assert.equal(next.pageVersions.pages[1].active, "white");
  assert.equal(next.pageVersions.pages[1].versions.blue, undefined);
});

test("an empty fallback keeps the page picker and its other saved versions available", () => {
  let doc = createProject("Empty fallback");
  doc.content.content = [paragraph("shared", "Prefix 012345 saved tail")];
  doc = ensurePageVersions(doc, [0, 15]);
  const id = doc.pageVersions.pages[1].id;
  doc = switchPageVersion(doc, id, "blue");
  const page = doc.pageVersions.pages[1];
  page.versions.pink = structuredClone(page.versions.white);
  page.versions.white = {
    slice: {
      content: [
        { type: "paragraph", attrs: { blockId: "empty", format: "action" } },
      ],
      openStart: 0,
      openEnd: 0,
    },
    firstBlockOffset: 0,
    firstBlockId: "empty",
    sceneVariants: {},
    sceneShots: {},
  };
  doc = burnPageVersion(doc, id);
  assert.equal(selectedPageVersions(doc).length, 2);
  assert.ok(doc.pageVersions.pages[1].versions.pink);
  doc = switchPageVersion(doc, id, "pink");
  assert.equal(
    doc.content.content[0].content[0].text,
    "Prefix 012345 saved tail",
  );
});

test("burn and page-version metadata form one undo/redo step without losing later component edits", () => {
  let document = fixture();
  const before = structuredClone(document);
  const next = burnPageVersion(document, document.pageVersions.pages[0].id);
  let state = EditorState.create({
    doc: schema.nodeFromJSON(before.content),
    plugins: [history()],
  });
  const dispatch = (tr) => {
    state = state.apply(tr);
    document = applyPageVersionChanges(
      { ...document, content: tr.doc.toJSON() },
      pageVersionChanges(tr),
    );
  };
  dispatch(
    closeHistory(state.tr)
      .replaceWith(
        0,
        state.doc.content.size,
        schema.nodeFromJSON(next.content).content,
      )
      .step(pageVersionStateStep(before, next)),
  );
  document.components.push({
    id: "later",
    name: "New character",
    type: "character",
  });
  assert.equal(undo(state, dispatch), true);
  assert.equal(
    JSON.stringify(document.content),
    JSON.stringify(before.content),
  );
  assert.equal(
    JSON.stringify(document.pageVersions),
    JSON.stringify(before.pageVersions),
  );
  assert.equal(document.components.at(-1).name, "New character");
  assert.equal(redo(state, dispatch), true);
  assert.equal(JSON.stringify(document.content), JSON.stringify(next.content));
  assert.equal(
    JSON.stringify(document.pageVersions),
    JSON.stringify(next.pageVersions),
  );
  assert.equal(document.components.at(-1).name, "New character");
});

test("even identical page text restores the selected version and catalogue on undo", () => {
  let document = createProject("Identical copies");
  document = ensurePageVersions(document);
  document = switchPageVersion(
    document,
    document.pageVersions.pages[0].id,
    "blue",
  );
  const before = structuredClone(document);
  const next = burnPageVersion(document, document.pageVersions.pages[0].id);
  let state = EditorState.create({
    doc: schema.nodeFromJSON(before.content),
    plugins: [history()],
  });
  const dispatch = (tr) => {
    state = state.apply(tr);
    document = applyPageVersionChanges(
      { ...document, content: tr.doc.toJSON() },
      pageVersionChanges(tr),
    );
  };
  dispatch(closeHistory(state.tr).step(pageVersionStateStep(before, next)));
  assert.equal(document.pageVersions.pages[0].active, "white");
  assert.equal(undo(state, dispatch), true);
  assert.deepEqual(document.pageVersions, before.pageVersions);
});

test("undo after a non-history edit keeps the new prefix and correct restored page boundaries", () => {
  let document = createProject("Rebased burn undo");
  document.content.content = [
    paragraph("first", "First"),
    paragraph("last", "Last"),
  ];
  document = ensurePageVersions(document, [0, 7]);
  const target = document.pageVersions.pages[1];
  const next = burnPageVersion(document, target.id);
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
  dispatch(
    closeHistory(state.tr)
      .delete(target.from, target.to)
      .step(pageVersionStateStep(document, next)),
  );
  dispatch(state.tr.insertText("XX", 3).setMeta("addToHistory", false));
  assert.equal(undo(state, dispatch), true);
  assert.equal(document.content.content[0].content[0].text, "FiXXrst");
  assert.equal(document.content.content[1].content[0].text, "Last");
  assert.equal(document.pageVersions.pages[0].to, 9);
  assert.equal(document.pageVersions.pages[1].from, 9);
  assert.equal(document.pageVersions.pages[1].to, state.doc.content.size);
});
