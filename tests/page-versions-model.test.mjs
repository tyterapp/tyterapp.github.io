import test from "node:test";
import { ensurePageColors, setPageColor } from "../src/page-colors.js";
import assert from "node:assert/strict";
import { Transform } from "@tiptap/pm/transform";
import { createProject, validateImport } from "../src/data.js";
import { scriptSearchMatches } from "../src/document-search.js";
import {
  pageVersionSchema as schema,
  ensurePageVersions,
  mapPageVersionRanges,
  switchPageVersion,
  pageVersionSlice,
  pageVersionAt,
  selectedPageVersions,
  pageVersionSources,
  splitPageVersion,
  removePageVersion,
  restorePageVersion,
  rebasePageVersionContent,
} from "../src/page-versions.js";

globalThis.location ||= { protocol: "https:" };
const { snapshotOf } = await import("../src/history.js");
const { readTYT, tytPayload } = await import("../src/tyt-format.js");

const paragraph = (id, text, marks) => ({
  type: "paragraph",
  attrs: { format: "action", blockId: id },
  ...(text
    ? { content: [{ type: "text", text, ...(marks ? { marks } : {}) }] }
    : {}),
});
const fixture = (
  blocks = [paragraph("one", "First page"), paragraph("two", "Second page")],
) => ({
  ...createProject("Page versions"),
  content: { type: "doc", content: blocks },
});
const textOf = (document) => schema.nodeFromJSON(document.content).textContent;
const edit = (document, from, to, text) => {
  const node = schema.nodeFromJSON(document.content);
  const tr = new Transform(node).replaceWith(
    from,
    to,
    text ? schema.text(text) : [],
  );
  return mapPageVersionRanges(document, tr.mapping, tr.doc.toJSON());
};
const validRanges = (document) => {
  let previous = 0;
  for (const page of document.pageVersions.pages) {
    assert.equal(page.from, previous);
    assert.ok(page.to > page.from);
    previous = page.to;
  }
  assert.equal(previous, schema.nodeFromJSON(document.content).content.size);
};

test("legacy relationship endpoints and graph positions follow exact component ID remaps without binding to a conflicting active character", () => {
  const white = fixture();
  const friend = {
    id: "friend",
    name: "Friend",
    type: "character",
    color: "#445566",
  };
  white.components = [
    {
      id: "person",
      name: "White character",
      type: "character",
      color: "#445566",
    },
    friend,
  ];
  white.relationships = [
    {
      id: "bond",
      sourceComponentId: "person",
      targetComponentId: "friend",
      type: "knows",
      direction: "directed",
      label: "White relationship",
      state: "",
      description: "",
      createdAt: "2026-10-18T10:00:00.000Z",
      updatedAt: "2026-10-18T10:00:00.000Z",
    },
  ];
  white.graphLayout = {
    characterPositions: { person: { x: 1, y: 2 }, friend: { x: 3, y: 4 } },
    zoom: 1,
  };
  const blue = fixture([paragraph("blue", "Blue page")]);
  blue.components = [
    { ...white.components[0], name: "Blue character" },
    friend,
  ];
  blue.relationships = [
    { ...white.relationships[0], label: "Blue relationship" },
  ];
  blue.graphLayout = {
    characterPositions: { person: { x: 9, y: 10 } },
    zoom: 2,
  };
  white.scriptVersions = { blue };
  const migrated = ensurePageVersions(white, [0, 12], {
    legacyPlans: { white: [0, 12], blue: [0] },
  });
  const archived = migrated.pageVersions.legacyVersions.blue;
  const blueId = archived.components.find(
    ({ name }) => name === "Blue character",
  ).id;
  assert.notEqual(blueId, "person");
  assert.equal(archived.relationships[0].sourceComponentId, blueId);
  assert.equal(archived.relationships[0].targetComponentId, "friend");
  assert.notEqual(archived.relationships[0].id, "bond");
  assert.deepEqual(archived.graphLayout.characterPositions, {
    [blueId]: { x: 9, y: 10 },
  });
  assert.deepEqual(migrated.graphLayout.characterPositions.person, {
    x: 1,
    y: 2,
  });
  assert.deepEqual(migrated.graphLayout.characterPositions[blueId], {
    x: 9,
    y: 10,
  });
  assert.equal(
    migrated.relationships.find(({ id }) => id === "bond").sourceComponentId,
    "person",
  );
  assert.equal(
    migrated.relationships.find(({ label }) => label === "Blue relationship")
      .sourceComponentId,
    blueId,
  );
  const reopened = readTYT(JSON.stringify(tytPayload(migrated)));
  assert.deepEqual(reopened.relationships, migrated.relationships);
  assert.deepEqual(reopened.graphLayout, migrated.graphLayout);
});

test("each page selects its own branch and exports current, unsaved edits", () => {
  let doc = ensurePageVersions(fixture(), [0, 12]);
  const [first, second] = doc.pageVersions.pages;
  doc = switchPageVersion(doc, second.id, "blue");
  doc = edit(doc, 13, 24, "Blue second page");
  assert.equal(doc.pageVersions.pages[1].from, 12);
  assert.equal(textOf(doc), "First pageBlue second page");
  assert.deepEqual(
    selectedPageVersions(doc).map((page) => page.versionId),
    ["white", "blue"],
  );
  assert.equal(
    selectedPageVersions(doc)[1].content.content[0].content[0].text,
    "Blue second page",
  );
  doc = switchPageVersion(doc, second.id, "white");
  assert.equal(textOf(doc), "First pageSecond page");
  doc = switchPageVersion(doc, first.id, "pink");
  doc = edit(doc, 1, 11, "Pink first");
  doc = switchPageVersion(doc, second.id, "blue");
  assert.equal(textOf(doc), "Pink firstBlue second page");
  validRanges(doc);
});

test("a paragraph shared by pages preserves both neighbouring fragments, marks, and caret offsets", () => {
  const marks = [
    { type: "bold" },
    { type: "comment", attrs: { id: "comment" } },
    { type: "entity", attrs: { id: "character", color: "#445566" } },
  ];
  let doc = ensurePageVersions(
    fixture([paragraph("long", "ABCDEFGHIJKLMNO", marks)]),
    [0, 6, 11],
  );
  const middle = doc.pageVersions.pages[1].id;
  assert.equal(pageVersionSlice(doc, middle).slice.openStart, 1);
  assert.equal(pageVersionSlice(doc, middle).firstBlockOffset, 5);
  doc = switchPageVersion(doc, middle, "blue");
  doc = edit(doc, 6, 11, "middle");
  assert.equal(textOf(doc), "ABCDEmiddleKLMNO");
  doc = switchPageVersion(doc, middle, "white");
  assert.equal(textOf(doc), "ABCDEFGHIJKLMNO");
  const dormant = pageVersionSources(doc, { allVersions: true }).find(
    (page) => page.pageId === middle && page.versionId === "blue",
  );
  assert.equal(dormant.firstBlockOffset, 5);
  assert.equal(dormant.content.content[0].content[0].text, "middle");
  assert.equal(dormant.content.content[0].attrs.blockId, "long");
  assert.ok(
    schema
      .nodeFromJSON(doc.content)
      .firstChild.firstChild.marks.some((mark) => mark.type.name === "comment"),
  );
  validRanges(doc);
});

test("insertions at the beginning of page two belong to page two", () => {
  let doc = ensurePageVersions(fixture(), [0, 12]);
  doc = edit(doc, 12, 12, "new");
  assert.equal(doc.pageVersions.pages[1].from, 12);
  assert.ok(
    selectedPageVersions(doc)[1]
      .content.content.map((node) =>
        node.content?.map((part) => part.text || "").join(""),
      )
      .join("")
      .includes("new"),
  );
  validRanges(doc);
});

test("loading old branches preserves the visible screenplay and removes inactive copies", () => {
  let doc = fixture();
  doc = ensurePageVersions(doc, [0, 12]);
  doc = switchPageVersion(doc, doc.pageVersions.pages[0].id, "blue");
  const content = doc.content;
  const next = validateImport(doc);
  assert.equal(next.pageVersions.mode, "colors");
  assert.deepEqual(
    next.content,
    validateImport({ ...doc, pageVersions: undefined }).content,
  );
  assert.ok(
    next.pageVersions.pages.every((page) => !Object.keys(page.versions).length),
  );
  assert.equal(next.pageVersions.legacyVersions, undefined);
  assert.deepEqual(next.scriptVersions, {});
});

test("split overflow uses independent plans and creates real blank slots for shorter versions", () => {
  let doc = ensurePageVersions(
    fixture([paragraph("long", "ABCDEFGHIJKLMNO")]),
    [0],
  );
  const id = doc.pageVersions.pages[0].id;
  doc = switchPageVersion(doc, id, "blue");
  doc = edit(doc, 1, 16, "AB");
  doc = splitPageVersion(doc, id, { blue: [0], white: [0, 6, 11] });
  assert.equal(doc.pageVersions.pages.length, 3);
  assert.equal(doc.pageVersions.pages[0].id, id);
  validRanges(doc);
  for (const page of [...doc.pageVersions.pages])
    doc = switchPageVersion(doc, page.id, "white");
  assert.equal(textOf(doc), "ABCDEFGHIJKLMNO");
  validRanges(doc);
});

test("delete/restore one page version leaves other selected versions intact and is reversible", () => {
  let doc = ensurePageVersions(fixture(), [0, 12]);
  const id = doc.pageVersions.pages[1].id;
  doc = switchPageVersion(doc, id, "blue");
  doc = edit(doc, 13, 24, "Changed");
  const removed = removePageVersion(doc, id, "blue");
  assert.equal(textOf(removed.document), "First pageSecond page");
  assert.equal(removed.wasActive, true);
  assert.equal(removePageVersion(doc, id, "white"), null);
  doc = restorePageVersion(removed.document, id, "blue", removed.snapshot, {
    activate: true,
  });
  assert.equal(textOf(doc), "First pageChanged");
  validRanges(doc);
});

test("adding overflow slots inside a shared paragraph never replaces the following page", () => {
  let doc = ensurePageVersions(
    fixture([
      paragraph("shared", "ABCDEFGHIJ"),
      paragraph("tail", "Neighbour"),
    ]),
    [0, 6],
  );
  const [first, next] = doc.pageVersions.pages;
  doc = switchPageVersion(doc, first.id, "blue");
  doc = edit(doc, 1, 6, "AB");
  doc = splitPageVersion(doc, first.id, { blue: [0], white: [0, 4] });
  assert.equal(doc.pageVersions.pages.length, 3);
  assert.equal(doc.pageVersions.pages[2].id, next.id);
  validRanges(doc);
  for (const page of doc.pageVersions.pages.slice(0, 2))
    doc = switchPageVersion(doc, page.id, "white");
  assert.equal(textOf(doc), "ABCDEFGHIJNeighbour");
  assert.equal(doc.pageVersions.pages[2].active, "white");
  validRanges(doc);
});

test("silent scene replacement maps page boundaries and malformed dormant alternatives fail import", () => {
  let doc = ensurePageVersions(fixture(), [0, 12]);
  const content = structuredClone(doc.content);
  content.content[0].content[0].text = "First page with a longer scene";
  doc = rebasePageVersionContent(doc, content);
  assert.equal(doc.pageVersions.pages[1].from, 32);
  validRanges(doc);
  doc.pageVersions.pages[0].versions.blue = {
    slice: { content: [{ type: "hacked" }], openStart: 0 },
  };
  assert.throws(() => validateImport(doc));
});

test("a reordered scene copy keeps the neighbour's IDs and remaps its own resources and cached variants", () => {
  const scene = (id, text) => ({
    ...paragraph(id, text),
    attrs: { format: "scene", blockId: id },
  });
  const marks = [
    { type: "comment", attrs: { id: "scene-comment" } },
    { type: "comment", attrs: { id: "locationless-comment" } },
    { type: "entity", attrs: { id: "scene-prop", color: "#445566" } },
  ];
  const first = [
    scene("first-heading", "INT. FIRST"),
    paragraph("first-body", "First"),
  ];
  const second = [
    scene("second-heading", "INT. SECOND"),
    paragraph("second-body", "Second", marks),
  ];
  const boundary = schema.nodeFromJSON({ type: "doc", content: first }).content
    .size;
  let doc = ensurePageVersions(fixture([...first, ...second]), [0, boundary]);
  const firstPage = doc.pageVersions.pages[0].id;
  const untouched = schema.nodeFromJSON(doc.content).toJSON().content.slice(2);
  const secondBodyPos = boundary + schema.nodeFromJSON(second[0]).nodeSize;
  doc.comments = [
    {
      id: "scene-comment",
      text: "Keep this attached",
      quote: "Second",
      blockId: "second-body",
      sceneId: "second-heading",
      sceneVariant: "A",
      anchor: secondBodyPos + 1,
    },
  ];
  doc.props = [
    {
      id: "scene-prop",
      name: "Second",
      blockId: "second-body",
      color: "#445566",
    },
  ];
  doc.sceneVariants = {
    "second-heading": {
      A: structuredClone(second),
      B: [
        scene("second-heading", "INT. SECOND B"),
        paragraph("second-variant-body", "Variant", [
          { type: "comment", attrs: { id: "variant-comment" } },
        ]),
      ],
    },
  };
  doc.comments.push({
    id: "variant-comment",
    text: "Variant note",
    quote: "Variant",
    blockId: "second-variant-body",
    sceneId: "second-heading",
    sceneVariant: "B",
    anchor: null,
  });
  doc.comments.push({
    id: "locationless-comment",
    text: "Imported note",
    quote: "Second",
    blockId: null,
    sceneId: null,
    anchor: null,
  });
  doc.sceneShots = {
    "second-heading": { A: { lens: "wide" }, B: { lens: "long" } },
  };
  doc.pageVersions.legacyVersions.blue = structuredClone({
    content: { type: "doc", content: second },
    comments: doc.comments,
    props: doc.props,
    sceneVariants: doc.sceneVariants,
    sceneShots: doc.sceneShots,
  });
  doc.pageVersions.legacyVersions.blue.sceneVariants[
    "second-heading"
  ].B[1].content[0].text = "Blue variant";
  doc.pageVersions.legacyVersions.blue.sceneShots["second-heading"].B.lens =
    "telephoto";
  doc.pageVersions.pages[0].versions.blue = {
    slice: schema
      .nodeFromJSON({ type: "doc", content: second })
      .slice(0)
      .toJSON(),
    firstBlockOffset: 0,
    firstBlockId: "second-heading",
  };
  const before = structuredClone(doc);
  doc = switchPageVersion(doc, firstPage, "blue");
  const blocks = doc.content.content;
  const headingId = blocks[0].attrs.blockId,
    bodyId = blocks[1].attrs.blockId;
  assert.notEqual(headingId, "second-heading");
  assert.notEqual(bodyId, "second-body");
  assert.deepEqual(blocks.slice(2), untouched);
  assert.equal(
    new Set(blocks.map((block) => block.attrs.blockId)).size,
    blocks.length,
  );
  const copiedCommentId = blocks[1].content[0].marks.find(
    (mark) => mark.type === "comment",
  ).attrs.id;
  const copiedPropId = blocks[1].content[0].marks.find(
    (mark) => mark.type === "entity",
  ).attrs.id;
  assert.notEqual(copiedCommentId, "scene-comment");
  assert.notEqual(copiedPropId, "scene-prop");
  assert.equal(
    doc.comments.find(({ id }) => id === copiedCommentId).blockId,
    bodyId,
  );
  assert.equal(
    doc.comments.find(({ id }) => id === copiedCommentId).sceneId,
    headingId,
  );
  assert.equal(
    doc.comments.find(({ id }) => id === copiedCommentId).anchor,
    schema.nodeFromJSON(blocks[0]).nodeSize + 1,
  );
  assert.equal(doc.props.find(({ id }) => id === copiedPropId).blockId, bodyId);
  const locationlessId = blocks[1].content[0].marks.filter(
    (mark) => mark.type === "comment",
  )[1].attrs.id;
  assert.notEqual(locationlessId, "locationless-comment");
  assert.equal(
    doc.comments.find(({ id }) => id === locationlessId).blockId,
    bodyId,
  );
  assert.equal(
    doc.comments.find(({ id }) => id === locationlessId).sceneId,
    headingId,
  );
  assert.equal(
    doc.comments.find(({ id }) => id === "scene-comment").blockId,
    "second-body",
  );
  assert.equal(
    doc.props.find(({ id }) => id === "scene-prop").blockId,
    "second-body",
  );
  assert.deepEqual(
    doc.sceneVariants["second-heading"],
    before.sceneVariants["second-heading"],
  );
  assert.deepEqual(
    doc.sceneShots[headingId],
    before.pageVersions.legacyVersions.blue.sceneShots["second-heading"],
  );
  const copiedVariant = doc.sceneVariants[headingId].B;
  assert.equal(copiedVariant[1].content[0].text, "Blue variant");
  assert.equal(copiedVariant[0].attrs.blockId, headingId);
  assert.notEqual(copiedVariant[1].attrs.blockId, "second-variant-body");
  const variantCommentId = copiedVariant[1].content[0].marks[0].attrs.id;
  assert.notEqual(variantCommentId, "variant-comment");
  assert.equal(
    doc.comments.find(({ id }) => id === variantCommentId).blockId,
    copiedVariant[1].attrs.blockId,
  );
  assert.equal(
    doc.comments.find(({ id }) => id === variantCommentId).sceneId,
    headingId,
  );
  const resources = [doc.comments.length, doc.props.length];
  doc = switchPageVersion(doc, firstPage, "white");
  const dormant = pageVersionSources(doc, { allVersions: true }).find(
    (entry) => entry.pageId === firstPage && entry.versionId === "blue",
  );
  assert.ok(dormant.source.sceneVariants[headingId]);
  assert.ok(dormant.source.comments.some(({ id }) => id === copiedCommentId));
  assert.ok(dormant.source.props.some(({ id }) => id === copiedPropId));
  doc = switchPageVersion(doc, firstPage, "blue");
  assert.equal(doc.content.content[0].attrs.blockId, headingId);
  assert.equal(doc.content.content[1].attrs.blockId, bodyId);
  assert.deepEqual([doc.comments.length, doc.props.length], resources);
  validRanges(doc);
});

test("copy IDs never shadow an existing resource and switching versions remaps neighbour comment anchors", () => {
  let doc = ensurePageVersions(fixture(), [0, 12]);
  const page = doc.pageVersions.pages[0];
  const suffix = page.id.replace(/[^\w-]/g, "").slice(0, 36);
  const reserved = `note-pv-${suffix}-comment`.slice(0, 95);
  doc.content.content[1].content[0].marks = [
    { type: "comment", attrs: { id: "note" } },
  ];
  doc.comments = [
    {
      id: "note",
      blockId: "two",
      text: "Original",
      quote: "Second page",
      anchor: 13,
    },
    { id: reserved, blockId: "one", text: "Existing resource", anchor: 1 },
  ];
  doc.pageVersions.pages[0].versions.blue = {
    slice: {
      content: [
        paragraph("two", "Different copied page", [
          { type: "comment", attrs: { id: "note" } },
        ]),
      ],
      openStart: 0,
      openEnd: 0,
    },
    firstBlockOffset: 0,
    firstBlockId: "two",
  };
  doc = switchPageVersion(doc, page.id, "blue");
  assert.equal(
    new Set(doc.comments.map(({ id }) => id)).size,
    doc.comments.length,
  );
  assert.equal(
    doc.comments.find(({ id }) => id === reserved).text,
    "Existing resource",
  );
  const secondStart = doc.pageVersions.pages[1].from;
  assert.equal(
    doc.comments.find(({ id }) => id === "note").anchor,
    secondStart + 1,
  );
  const copyId = doc.content.content[0].content[0].marks[0].attrs.id;
  assert.notEqual(copyId, reserved);
  assert.equal(doc.comments.find(({ id }) => id === copyId).anchor, 1);
});

test("color changes preserve scene alternatives and shots through a TYT validation round trip", () => {
  let doc = ensurePageColors(ensurePageVersions(fixture(), [0]));
  doc.sceneVariants = {};
  doc.sceneShots = {};
  const before = JSON.stringify(doc.content);
  doc = setPageColor(doc, doc.pageVersions.pages[0].id, "pink");
  const next = validateImport(doc);
  assert.equal(next.pageVersions.pages[0].active, "pink");
  assert.deepEqual(next.pageVersions.pages[0].versions, {});
  assert.deepEqual(next.sceneVariants, doc.sceneVariants);
  assert.deepEqual(next.sceneShots, doc.sceneShots);
  assert.equal(JSON.stringify(doc.content), before);
});

test("migration discards collapsed recovery pages without restoring their dormant text", () => {
  let doc = ensurePageVersions(fixture(), [0, 12]);
  const size = schema.nodeFromJSON(doc.content).content.size;
  doc.pageVersions.pages.push({
    id: "collapsed",
    from: size,
    to: size,
    active: "blue",
    versions: {},
  });
  const next = ensurePageColors(doc);
  assert.equal(next.pageVersions.pages.length, 2);
  assert.equal(next.content, doc.content);
  assert.ok(next.pageVersions.pages.every((page) => page.to > page.from));
});

test("restoring a dormant deleted middle page gives its text back to its own range and preserves the next page", () => {
  let doc = ensurePageVersions(
    fixture([
      paragraph("one", "First page"),
      paragraph("two", "Second page"),
      paragraph("three", "Third page"),
    ]),
    [0, 12, 25],
  );
  const middleId = doc.pageVersions.pages[1].id,
    nextId = doc.pageVersions.pages[2].id;
  doc = switchPageVersion(doc, middleId, "blue");
  const node = schema.nodeFromJSON(doc.content),
    middle = doc.pageVersions.pages[1];
  const tr = new Transform(node).delete(middle.from, middle.to);
  doc = mapPageVersionRanges(doc, tr.mapping, tr.doc.toJSON());
  assert.equal(selectedPageVersions(doc).length, 2);
  assert.deepEqual(
    selectedPageVersions(doc).map((entry) => entry.pageNumber),
    [1, 2],
  );
  assert.equal(
    pageVersionSources(doc, { allVersions: true }).some(
      (entry) => entry.pageId === middleId,
    ),
    false,
  );
  doc = switchPageVersion(doc, middleId, "white");
  assert.equal(textOf(doc), "First pageSecond pageThird page");
  assert.equal(doc.pageVersions.pages[2].id, nextId);
  assert.equal(
    selectedPageVersions(doc)[1].content.content[0].content[0].text,
    "Second page",
  );
  assert.equal(
    selectedPageVersions(doc)[2].content.content[0].content[0].text,
    "Third page",
  );
  validRanges(doc);
});
