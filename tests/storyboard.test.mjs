import { test } from "node:test";
import assert from "node:assert/strict";
import { createProject, validateImport } from "../src/data.js";
import { switchSceneVariant } from "../src/scene-variants.js";
import { updateShotSettings, shotScenes } from "../src/shot-info.js";
import {
  storyboardFrames,
  cleanFrames,
  playSlides,
} from "../src/storyboard-data.js";
import {
  addStoryboardScene,
  changeSceneBlock,
  moveStoryboardScene,
  moveSceneBlock,
  removeSceneBlock,
  migrateStoryboard,
  pasteStoryboardImages,
  moveStoryboardFrame,
} from "../src/storyboard-model.js";
import { storyboardManifest } from "../src/storyboard-export.js";
const image = "data:image/png;base64,aGVsbG8=";
test("clipboard starts in an empty scene's first slot, appends to illustrated scenes and creates scenes at the document end", () => {
  let doc = updateShotSettings(fixture(), "one", "A", {
    frames: [{ id: "empty", image: "", durationMs: 1700, transition: "fade" }],
  });
  doc = pasteStoryboardImages(doc, [image], "one", "A").document;
  assert.equal(doc.sceneShots.one.A.frames[0].id, "empty");
  assert.equal(doc.sceneShots.one.A.frames[0].durationMs, 1700);
  doc = updateShotSettings(doc, "one", "A", {
    frames: [
      ...doc.sceneShots.one.A.frames,
      { id: "spare", image: "", durationMs: 500 },
    ],
  });
  doc = pasteStoryboardImages(doc, [image], "one", "A").document;
  assert.equal(doc.sceneShots.one.A.frames.length, 3);
  assert.equal(doc.sceneShots.one.A.frames[1].image, "");
  const appended = pasteStoryboardImages(doc, [image, image]);
  const scenes = shotScenes(appended.document);
  assert.deepEqual(
    scenes.slice(0, 2).map((item) => item.id),
    ["one", "two"],
  );
  assert.equal(scenes.length, 4);
  for (const scene of scenes.slice(2))
    assert.equal(scene.settings.frames[0].image, image);
});
test("moving a slide preserves timings and transitions, isolates scene variants and rejects overflowing destinations atomically", () => {
  let doc = updateShotSettings(fixture(), "one", "A", {
    frames: [{ id: "f", image, durationMs: 1700, transition: "fade" }],
  });
  doc = updateShotSettings(doc, "two", "A", {
    frames: [{ id: "other", image, durationMs: 500 }],
  });
  doc = switchSceneVariant(doc, "two", "B");
  const next = moveStoryboardFrame(doc, "one", "A", "f", "two");
  assert.equal(next.sceneShots.one.A.frames.length, 0);
  assert.deepEqual(
    next.sceneShots.two.B.frames[0],
    doc.sceneShots.one.A.frames[0],
  );
  assert.deepEqual(next.sceneShots.two.A, doc.sceneShots.two.A);
  assert.equal(moveStoryboardFrame(doc, "one", "B", "f", "two"), doc);
  const full = updateShotSettings(doc, "two", "B", {
    frames: Array.from({ length: 200 }, (_, i) => ({
      id: `f-${i}`,
      image,
      durationMs: 500,
    })),
  });
  assert.throws(() => moveStoryboardFrame(full, "one", "A", "f", "two"));
  assert.equal(full.sceneShots.one.A.frames.length, 1);
  assert.throws(() => pasteStoryboardImages(full, [image], "two", "B"));
});
const p = (format, text, id) => ({
  type: "paragraph",
  attrs: { format, blockId: id },
  content: [{ type: "text", text }],
});
function fixture() {
  const doc = createProject("Раскадровка");
  doc.content.content = [
    p("scene", "INT. ROOM — DAY", "one"),
    p("action", "Action one", "a"),
    p("speech", "Hello", "b"),
    p("scene", "EXT. GARDEN — DAY", "two"),
    p("action", "Action two", "c"),
  ];
  return doc;
}
test("explicit scene insertion supports both sides, preserves resources and skips adjacent no-op drops", () => {
  const doc = fixture();
  doc.sceneShots = { one: { A: { drama: 8 } } };
  doc.sceneVariants = { one: { B: [p("scene", "Alternative", "one")] } };
  const before = moveStoryboardScene(doc, "two", "one", "before");
  assert.deepEqual(
    before.content.content.map((n) => n.attrs.blockId),
    ["two", "c", "one", "a", "b"],
  );
  assert.deepEqual(before.sceneShots, doc.sceneShots);
  assert.deepEqual(before.sceneVariants, doc.sceneVariants);
  assert.deepEqual(
    moveStoryboardScene(before, "two", "one", "after").content,
    doc.content,
  );
  assert.equal(moveStoryboardScene(doc, "one", "two", "before"), doc);
  assert.equal(moveStoryboardScene(doc, "two", "one", "after"), doc);
});
test("slides and zero drama survive import, variant switching and the portable manifest", () => {
  let doc = updateShotSettings(fixture(), "one", "A", {
    frames: [
      { id: "f1", image, durationMs: 1500 },
      { id: "f2", image: "", durationMs: 2200, transition: "fade" },
    ],
    drama: 0,
    act: 2,
    status: "production",
    synopsis: "A meeting",
  });
  doc = switchSceneVariant(doc, "one", "B");
  doc = updateShotSettings(doc, "one", "B", {
    frames: [{ id: "b", image, durationMs: 800 }],
    drama: 10,
  });
  doc = validateImport(JSON.parse(JSON.stringify(doc)));
  assert.equal(doc.sceneShots.one.A.frames.length, 2);
  assert.equal(doc.sceneShots.one.A.drama, 0);
  assert.equal(doc.sceneShots.one.B.frames[0].id, "b");
  let manifest = storyboardManifest(doc);
  assert.equal(manifest.scenes[0].variant, "B");
  assert.equal(manifest.scenes[0].frames[0].durationMs, 800);
  doc = switchSceneVariant(doc, "one", "A");
  manifest = storyboardManifest(doc);
  assert.equal(manifest.scenes[0].frames[1].image, null);
  assert.equal(manifest.scenes[0].settings.act, 2);
  assert.equal(doc.sceneShots.one.A.image, image);
  assert.equal(
    "image" in storyboardManifest(doc, { images: false }).scenes[0].frames[0],
    false,
  );
});
test("scene structure edits preserve unchanged marks and move actual screenplay blocks", () => {
  let doc = fixture();
  doc.content.content[1].content = [
    { type: "text", text: "Action", marks: [{ type: "bold" }] },
    { type: "text", text: " one" },
  ];
  doc = changeSceneBlock(doc, "one", "a", { text: "Action changed" });
  assert.deepEqual(doc.content.content[1].content[0], {
    type: "text",
    text: "Action",
    marks: [{ type: "bold" }],
  });
  doc = moveSceneBlock(doc, "one", "b", "a");
  assert.equal(doc.content.content[1].attrs.blockId, "b");
  doc = moveStoryboardScene(doc, "two", "one");
  assert.equal(shotScenes(doc)[0].id, "two");
  assert.equal(shotScenes(doc)[1].blocks[1].attrs.blockId, "b");
  doc = moveStoryboardScene(doc, "two", "one");
  assert.equal(shotScenes(doc)[0].id, "one");
  doc = removeSceneBlock(doc, "one", "b");
  assert.equal(shotScenes(doc)[0].blocks.length, 2);
  const guarded = removeSceneBlock(doc, "one", "one");
  assert.equal(guarded, doc);
  const added = addStoryboardScene(doc);
  assert.equal(shotScenes(added.document).at(-1).id, added.id);
});
test("legacy outline ideas migrate once without dropping unlinked cards or existing shot data", () => {
  let doc = fixture();
  delete doc.storyboardVersion;
  doc.sceneShots = { one: { A: { name: "Existing", image } } };
  doc.outline = {
    columns: [{ id: "act" }],
    cards: [
      {
        id: "linked",
        columnId: "act",
        blockId: "one",
        text: "Synopsis",
        drama: 7,
      },
      {
        id: "idea",
        title: "INT. NEW — DAY",
        text: "An unlinked idea",
        drama: 0,
      },
    ],
  };
  const migrated = migrateStoryboard(doc);
  assert.equal(shotScenes(migrated).length, 3);
  assert.equal(migrated.sceneShots.one.A.name, "Existing");
  assert.equal(migrated.sceneShots.one.A.drama, 7);
  assert.equal(storyboardFrames(migrated.sceneShots.one.A)[0].image, image);
  assert.equal(migrateStoryboard(migrated), migrated);
  assert.equal(
    validateImport(migrated).content.content.length,
    migrated.content.content.length,
  );
});
test("malformed slides cannot inject URLs, duplicate IDs or unbounded timings", () => {
  const frames = cleanFrames([
    { id: "x", image: "https://tracker.test/a.png", durationMs: -9 },
    { id: "x", image },
    { id: "y", image, durationMs: Infinity },
    { id: "z", image, durationMs: 1e9 },
  ]);
  assert.equal(frames.length, 3);
  assert.equal(frames[0].image, "");
  assert.equal(frames[0].durationMs, 100);
  assert.equal(frames[1].durationMs, 5000);
  assert.equal(frames[2].durationMs, 600000);
});
test("hover playback uses each slide timing, stops and returns to the first slide", async () => {
  const seen = [];
  const settings = {
    frames: [
      { id: "a", image, durationMs: 100 },
      { id: "b", image, durationMs: 100 },
    ],
    playbackLoop: false,
  };
  const stop = playSlides(settings, (frame) => seen.push(frame.id));
  await new Promise((resolve) => setTimeout(resolve, 240));
  assert.deepEqual(seen, ["b"]);
  stop();
  assert.deepEqual(seen, ["b", "a"]);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(seen, ["b", "a"]);
});
