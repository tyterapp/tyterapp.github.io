import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../src/data.js";
import {
  ensurePageVersions,
  selectedPageVersions,
} from "../src/page-versions.js";
globalThis.location ||= { protocol: "http:" };
globalThis.window ||= {};
const { snapshotOf, snapshotForArea, restoreSnapshotForArea } =
  await import("../src/history.js");

const paragraph = (text, id) => ({
  type: "paragraph",
  attrs: { blockId: id, format: "action" },
  content: [{ type: "text", text }],
});
function fixture() {
  let document = createProject("History pages");
  document.content.content = [
    paragraph("Selected Blue", "blue"),
    paragraph("Selected Pink", "pink"),
  ];
  document.notes = {
    content: { type: "doc", content: [paragraph("Current notes", "note")] },
    comments: [],
  };
  document.outline = {
    columns: [{ id: "act", title: "Current act" }],
    cards: [],
  };
  document = ensurePageVersions(document, [0, "Selected Blue".length + 2]);
  document.pageVersions.pages[0].active = "blue";
  document.pageVersions.pages[1].active = "pink";
  return document;
}

test("screenplay snapshots restore selected versions with their exact matching text and keep current notes/outline", () => {
  const before = fixture();
  const snapshot = structuredClone(snapshotOf(before));
  const current = structuredClone(before);
  current.content.content[0].content[0].text = "Changed draft";
  current.pageVersions.pages[0].active = "yellow";
  current.notes.content.content[0].content[0].text = "Notes after snapshot";
  current.outline.columns[0].title = "Act after snapshot";
  const restored = restoreSnapshotForArea(current, snapshot, "screenplay");
  assert.deepEqual(
    selectedPageVersions(restored).map((page) => [
      page.versionId,
      page.content.content[0].content[0].text,
    ]),
    [
      ["blue", "Selected Blue"],
      ["pink", "Selected Pink"],
    ],
  );
  assert.equal(restored.notes, current.notes);
  assert.equal(restored.outline, current.outline);
  assert.notEqual(restored.pageVersions, snapshot.pageVersions);
  restored.pageVersions.pages[0].active = "green";
  assert.equal(snapshot.pageVersions.pages[0].active, "blue");
});

test("notes and outline restore preserve page selection, text and unrelated data by reference", () => {
  const current = fixture();
  const previous = structuredClone(snapshotOf(current));
  previous.scriptVersion = "cherry";
  previous.notes.content.content[0].content[0].text = "Earlier notes";
  previous.outline.columns[0].title = "Earlier act";
  previous.pageVersions.pages[0].active = "yellow";
  for (const area of ["notes", "outline"]) {
    const restored = restoreSnapshotForArea(current, previous, area);
    assert.equal(restored.pageVersions, current.pageVersions);
    assert.equal(restored.content, current.content);
    assert.equal(restored.metadata, current.metadata);
    assert.equal(restored.scriptVersion, current.scriptVersion);
    assert.equal(restored.pageVersions.pages[0].active, "blue");
    if (area === "notes") {
      assert.equal(restored.outline, current.outline);
      assert.equal(
        restored.notes.content.content[0].content[0].text,
        "Earlier notes",
      );
    } else {
      assert.equal(restored.notes, current.notes);
      assert.equal(restored.outline.columns[0].title, "Earlier act");
    }
  }
  assert.deepEqual(Object.keys(snapshotForArea(previous, "outline")), [
    "outline",
  ]);
});

test("restoring a legacy screenplay explicitly resets incompatible page ranges and alternatives for fresh measurement", () => {
  const current = fixture();
  const old = createProject("Legacy history");
  old.content.content = [
    paragraph("An entirely different older document", "old"),
  ];
  old.scriptVersion = "green";
  const restored = restoreSnapshotForArea(
    current,
    snapshotOf(old),
    "screenplay",
  );
  assert.equal(restored.pageVersions, undefined);
  assert.ok(Object.hasOwn(restored, "pageVersions"));
  assert.equal(
    restored.content.content[0].content[0].text,
    "An entirely different older document",
  );
  assert.equal(restored.notes, current.notes);
  assert.equal(restored.outline, current.outline);
  assert.deepEqual(selectedPageVersions(restored), []);
  const migrated = ensurePageVersions(restored, [0]);
  assert.deepEqual(
    selectedPageVersions(migrated).map((page) => page.versionId),
    ["green"],
  );
  assert.deepEqual(
    current.pageVersions.pages.map((page) => page.active),
    ["blue", "pink"],
  );
});
