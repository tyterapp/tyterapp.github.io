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
} from "../src/storyboard-model.js";
import { storyboardManifest } from "../src/storyboard-export.js";
const image = "data:image/png;base64,aGVsbG8=";
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
