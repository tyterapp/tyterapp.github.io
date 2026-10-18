import test from "node:test";
import assert from "node:assert/strict";
import { createProject, validateImport } from "../src/data.js";
import {
  libraryFromDocument,
  mergeComponentLibrary,
  readComponentLibrary,
} from "../src/component-library.js";
import { relationshipsForComponent } from "../src/component-relationships.js";
globalThis.location ||= { protocol: "http:" };
globalThis.window ||= {};
const { readTYT, tytPayload } = await import("../src/tyt-format.js");
const { snapshotOf, restoreSnapshotForArea } =
  await import("../src/history.js");

function fixture() {
  const document = createProject("Relationship source");
  document.id = "relationship-library";
  document.components = [
    {
      id: "anna",
      name: "Anna",
      type: "character",
      aliases: ["Ann"],
      characterPayload: {
        biography: "Keep her story",
        future: { role: "lead" },
      },
      extensions: {
        character: { notes: "Keep notes", position: { x: 20, y: -40 } },
        other: { enabled: true },
      },
      libraryOrigin: { sourceVersion: "v2", mode: "linked" },
    },
    { id: "bob", name: "Bob", type: "character" },
  ];
  document.relationships = [
    {
      id: "anna-bob",
      sourceComponentId: "anna",
      targetComponentId: "bob",
      type: "friend",
      label: "Old friends",
      direction: "bidirectional",
      state: "Growing apart",
      description: "A long story",
      sourceSceneId: "scene-missing",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  ];
  document.graphLayout = {
    characterPositions: { anna: { x: 30, y: -10 }, bob: { x: 300, y: 20 } },
    viewport: { x: 0, y: 20, zoom: 1.2 },
  };
  return validateImport(document);
}

test("TYT and validation retain hidden character payload, graph positions, stable IDs and unknown relationship endpoints", () => {
  const source = fixture();
  source.components[0].type = "place";
  source.relationships.push({
    ...source.relationships[0],
    id: "missing-person",
    targetComponentId: "unknown-person",
    direction: "directed",
  });
  const loaded = readTYT(
    JSON.stringify(
      tytPayload(source, [
        {
          createdAt: Date.now(),
          label: "Before category",
          area: "screenplay",
          snapshot: snapshotOf(source),
        },
      ]),
    ),
  );
  assert.equal(loaded.components[0].id, "anna");
  assert.equal(loaded.components[0].type, "place");
  assert.deepEqual(
    loaded.components[0].characterPayload,
    source.components[0].characterPayload,
  );
  assert.deepEqual(
    loaded.components[0].extensions,
    source.components[0].extensions,
  );
  assert.deepEqual(loaded.graphLayout, source.graphLayout);
  assert.deepEqual(loaded.relationships, source.relationships);
  assert.deepEqual(relationshipsForComponent(loaded, "anna"), []);
  loaded.components[0].type = "character";
  assert.equal(relationshipsForComponent(loaded, "anna").length, 2);
  assert.equal(relationshipsForComponent(loaded, "anna")[1].unresolved, true);
  assert.deepEqual(
    loaded.importedHistory[0].snapshot.relationships,
    source.relationships,
  );
});

test("history restores relationship data with screenplay and preserves it when restoring notes or outline", () => {
  const document = fixture();
  const snapshot = structuredClone(snapshotOf(document));
  const current = { ...document, relationships: [] };
  assert.deepEqual(
    restoreSnapshotForArea(current, snapshot, "screenplay").relationships,
    document.relationships,
  );
  for (const area of ["notes", "outline"])
    assert.equal(
      restoreSnapshotForArea(current, snapshot, area).relationships,
      current.relationships,
    );
});

test("TYTL subsets preserve external endpoints without attaching matching local names or IDs; exact library identity resolves later", () => {
  const source = fixture(),
    library = libraryFromDocument(source, ["anna"]);
  assert.equal(library.relationships.length, 1);
  assert.deepEqual(
    library.components[0].characterPayload,
    source.components[0].characterPayload,
  );
  let target = createProject("Target");
  target.components = [{ id: "bob", name: "Bob", type: "character" }];
  target = mergeComponentLibrary(target, library, ["anna"]).document;
  const anna = target.components.find(
    (component) => component.librarySource?.componentId === "anna",
  );
  const relationship = target.relationships[0];
  assert.equal(relationship.sourceComponentId, anna.id);
  assert.notEqual(relationship.targetComponentId, "bob");
  assert.ok(relationship.targetComponentId.startsWith("unresolved-"));
  assert.equal(relationshipsForComponent(target, anna.id)[0].unresolved, true);
  const stableId = relationship.id,
    stableMissing = relationship.targetComponentId;
  target = mergeComponentLibrary(target, library, ["anna"]).document;
  assert.equal(target.relationships.length, 1);
  assert.equal(target.relationships[0].id, stableId);
  assert.equal(target.relationships[0].targetComponentId, stableMissing);
  const full = libraryFromDocument(source);
  const collision = mergeComponentLibrary(target, full, ["anna", "bob"]);
  assert.equal(collision.skipped, 1);
  assert.equal(
    collision.document.relationships[0].targetComponentId,
    stableMissing,
  );
  target.components[0] = {
    ...target.components[0],
    name: "An unrelated local person",
  };
  target = mergeComponentLibrary(target, full, ["anna", "bob"]).document;
  const bob = target.components.find(
    (component) => component.librarySource?.componentId === "bob",
  );
  assert.ok(bob && bob.id !== "bob");
  assert.equal(target.relationships[0].id, stableId);
  assert.equal(target.relationships[0].targetComponentId, bob.id);
  assert.equal(relationshipsForComponent(target, anna.id)[0].unresolved, false);
  assert.deepEqual(
    target.graphLayout.characterPositions[anna.id],
    source.graphLayout.characterPositions.anna,
  );
  assert.deepEqual(
    target.graphLayout.characterPositions[bob.id],
    source.graphLayout.characterPositions.bob,
  );
});

test("an old TYTL update does not erase hidden extensions or relationships when the source component changes category", () => {
  const source = fixture(),
    original = libraryFromDocument(source);
  let target = mergeComponentLibrary(createProject("Target"), original, [
    "anna",
    "bob",
  ]).document;
  const legacy = readComponentLibrary(
    JSON.stringify({
      format: "tyter-component-library",
      version: 1,
      id: original.id,
      name: original.name,
      folders: [],
      components: original.components.map(
        ({ characterPayload, extensions, libraryOrigin, ...component }) => ({
          ...component,
          type: "place",
        }),
      ),
    }),
  );
  const before = structuredClone(target);
  target = mergeComponentLibrary(target, legacy, ["anna", "bob"]).document;
  assert.equal(target.components[0].id, before.components[0].id);
  assert.equal(target.components[0].type, "place");
  assert.deepEqual(
    target.components[0].characterPayload,
    before.components[0].characterPayload,
  );
  assert.deepEqual(
    target.components[0].extensions,
    before.components[0].extensions,
  );
  assert.deepEqual(
    target.components[0].libraryOrigin,
    before.components[0].libraryOrigin,
  );
  assert.deepEqual(target.relationships, before.relationships);
  const partial = {
    ...legacy,
    components: legacy.components.map((component) => ({
      ...component,
      characterPayload: null,
      extensions: { character: { notes: "Updated notes" } },
    })),
  };
  target = mergeComponentLibrary(target, partial, ["anna", "bob"]).document;
  assert.deepEqual(
    target.components[0].characterPayload,
    before.components[0].characterPayload,
  );
  assert.equal(
    target.components[0].extensions.character.notes,
    "Updated notes",
  );
  assert.deepEqual(
    target.components[0].extensions.character.position,
    before.components[0].extensions.character.position,
  );
  const roundTrip = readComponentLibrary(
    JSON.stringify(libraryFromDocument(target)),
  );
  assert.equal(roundTrip.relationships.length, 1);
  assert.deepEqual(
    roundTrip.components[0].characterPayload,
    before.components[0].characterPayload,
  );
});

test("legacy TYT/library files stay accepted and oversized opaque extensions fail explicitly instead of disappearing", () => {
  const legacy = createProject("Legacy");
  delete legacy.relationships;
  assert.deepEqual(validateImport(legacy).relationships, []);
  const source = fixture();
  source.components[0].characterPayload.biography = "x".repeat(250001);
  assert.throws(() => validateImport(source), /слишком большие/);
});
