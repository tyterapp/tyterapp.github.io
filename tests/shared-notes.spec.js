import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import {
  scriptVersionSnapshot,
  switchScriptVersion,
} from "../src/script-versions.js";
globalThis.location ||= { protocol: "http:" };
globalThis.window ||= {};
const { readTYT, tytPayload } = await import("../src/tyt-format.js");
const { snapshotForArea, snapshotOf } = await import("../src/history.js");

const note = (text) => ({
  content: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { blockId: "note", format: "plain" },
        content: [
          {
            type: "text",
            text,
            marks: [{ type: "comment", attrs: { id: "comment" } }],
          },
        ],
      },
    ],
  },
  comments: [{ id: "comment", text: `О ${text}`, blockId: "note", anchor: 1 }],
});
test("legacy notes merge once, preserve comments and remap colliding anchors", () => {
  const source = createProject("Один файл заметок");
  source.notes = note("Белая заметка");
  const blue = {
    ...scriptVersionSnapshot(source),
    notes: note("Синяя заметка"),
  };
  source.scriptVersions = { blue, pink: structuredClone(blue) };
  const migrated = validateImport(source);
  expect(
    migrated.notes.content.content.map((block) => block.content[0].text),
  ).toEqual(["v1 White", "Белая заметка", "v2 Blue", "Синяя заметка"]);
  expect(migrated.notes.comments).toHaveLength(2);
  const blocks = migrated.notes.content.content;
  expect(new Set(blocks.map((block) => block.attrs.blockId)).size).toBe(4);
  expect(
    new Set(migrated.notes.comments.map((comment) => comment.id)).size,
  ).toBe(2);
  migrated.notes.comments.forEach((comment) => {
    const block = blocks.find(
      (block) => block.attrs.blockId === comment.blockId,
    );
    expect(block.content[0].marks[0].attrs.id).toBe(comment.id);
    expect(comment.anchor).toBeGreaterThan(1);
  });
  expect(migrated.scriptVersions.blue.notes).toBeUndefined();
  expect(migrated.scriptVersions.pink.notes).toBeUndefined();
  const restored = readTYT(JSON.stringify(tytPayload(migrated)));
  expect(restored.notes).toEqual(migrated.notes);
  expect(validateImport(switchScriptVersion(restored, "blue")).notes).toEqual(
    migrated.notes,
  );
});
test("a note saved only in an inactive version survives; screenplay history does not overwrite it", () => {
  const source = createProject("Старая заметка");
  source.scriptVersions = {
    blue: { ...scriptVersionSnapshot(source), notes: note("Сохранено") },
  };
  const migrated = validateImport(source);
  expect(migrated.notes.content.content[0].content[0].text).toBe("Сохранено");
  const history = snapshotOf(migrated);
  expect(snapshotForArea(history, "screenplay")).not.toHaveProperty("notes");
  expect(snapshotForArea(history, "notes")).toEqual({ notes: migrated.notes });
  const other = validateImport(createProject("Другой документ"));
  expect(other.notes).toBeUndefined();
});
