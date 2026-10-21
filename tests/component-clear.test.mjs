import test from "node:test";
import assert from "node:assert/strict";
import {
  clearDocumentComponents,
  componentClearState,
} from "../src/component-clear.js";
import { ensurePageVersions, switchPageVersion } from "../src/page-versions.js";
import {
  componentClearFixture,
  paragraph,
} from "./helpers/component-clear-fixture.js";

const entities = (value) =>
  JSON.stringify(value).match(/"type":"entity"/g) || [];
const text = (value) => JSON.stringify(value).match(/"text":"[^"]*"/g);

test("clears local, disabled and linked components across screenplay, notes and scene alternatives without losing text", () => {
  const { document, other, library } = componentClearFixture();
  const original = structuredClone({ document, other, library });
  const next = clearDocumentComponents(document);
  assert.deepEqual(next.components, []);
  assert.equal(entities(next.content).length, 0);
  assert.equal(entities(next.notes).length, 0);
  assert.equal(entities(next.sceneVariants).length, 0);
  for (const key of ["content", "notes", "sceneVariants"])
    assert.deepEqual(text(next[key]), text(document[key]));
  assert.deepEqual(next.comments, document.comments);
  assert.deepEqual(next.componentFolders, document.componentFolders);
  assert.deepEqual(
    next.collapsedComponentFolders,
    document.collapsedComponentFolders,
  );
  assert.deepEqual({ document, other, library }, original);
});

test("clears relationships and component positions but preserves props, unrelated marks and graph settings", () => {
  const { document } = componentClearFixture();
  document.content.content.push(paragraph("action", "Дверь", "prop", "door"));
  document.content.content[1].content[0].marks.push(
    { type: "comment", attrs: { id: "comment" } },
    { type: "link", attrs: { href: "https://example.test/" } },
  );
  const next = clearDocumentComponents(document);
  assert.deepEqual(next.relationships, []);
  assert.deepEqual(next.graphLayout, {
    characterPositions: {},
    camera: document.graphLayout.camera,
  });
  assert.deepEqual(next.props, [{ ...document.props[0], componentId: null }]);
  assert.deepEqual(
    next.content.content.at(-1),
    document.content.content.at(-1),
  );
  assert.deepEqual(
    next.content.content[1].content[0].marks,
    document.content.content[1].content[0].marks.slice(1),
  );
});

test("page colour changes and legacy snapshots cannot resurrect cleared components, and one resource snapshot restores them", () => {
  const { document } = componentClearFixture();
  let versioned = ensurePageVersions(document);
  const pageId = versioned.pageVersions.pages[0].id;
  versioned = switchPageVersion(versioned, pageId, "blue");
  versioned.pageVersions.legacyVersions = { pink: structuredClone(document) };
  versioned.scriptVersions = { yellow: structuredClone(document) };
  const next = clearDocumentComponents(versioned);
  assert.equal(entities(next).length, 0);
  assert.deepEqual(next.pageVersions.legacyVersions.pink.components, []);
  assert.deepEqual(next.scriptVersions.yellow.components, []);
  const white = switchPageVersion(next, pageId, "white");
  assert.deepEqual(white.components, []);
  assert.equal(entities(white).length, 0);
  assert.deepEqual(text(white.content), text(document.content));
  const restored = { ...next, ...componentClearState(versioned) };
  assert.deepEqual(
    JSON.parse(JSON.stringify(restored)),
    JSON.parse(JSON.stringify(versioned)),
  );
});
