import test from "node:test";
import assert from "node:assert/strict";
import { createProject, validateImport } from "../src/data.js";
import { storyboardScenes } from "../src/storyboard-model.js";
import {
  storyboardFrameFilename,
  storyboardManifest,
  exportStoryboard,
  exportScreenplayJSON,
} from "../src/storyboard-export.js";

const p = (id, text, sceneVariant = "A") => ({
  type: "paragraph",
  attrs: { format: "scene", blockId: id, sceneVariant },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const image = "data:image/png;base64,aGVsbG8=";
function fixture() {
  const doc = createProject("All scenes");
  doc.content.content = [
    p("one", "ИНТ. ДОМ / ДЕНЬ: ВСТРЕЧА?"),
    p("two", "", "B"),
    p("three", "ИНТ. ДОМ / ДЕНЬ: ВСТРЕЧА?"),
  ];
  const secondStart = doc.content.content[0].content[0].text.length + 2;
  const size = doc.content.content.reduce(
    (n, block) => n + 2 + (block.content?.[0].text.length || 0),
    0,
  );
  doc.pageVersions = {
    version: 1,
    mode: "colors",
    pages: [
      {
        id: "page-one",
        from: 0,
        to: secondStart,
        active: "blue",
        versions: {},
        flow: true,
      },
      {
        id: "page-two",
        from: secondStart,
        to: size,
        active: "green",
        versions: {},
        flow: true,
      },
    ],
  };
  doc.sceneShots = {
    one: {
      A: {
        shootingDate: "2026-11-02",
        location: { address: "Studio" },
        aspectRatio: "2.39",
        drama: 0,
        status: "production",
        frames: [
          { id: "one-f1", image, durationMs: 1700, transition: "fade" },
          { id: "one-empty", image: "", durationMs: 500, transition: "cut" },
        ],
      },
      B: { frames: [{ id: "inactive", image, durationMs: 3000 }] },
    },
    two: {
      B: {
        frames: [{ id: "two-f1", image, durationMs: 800, transition: "cut" }],
      },
    },
  };
  return doc;
}

test("all storyboard scenes retain page numbers, version labels, slide order and empty scenes", async () => {
  const doc = fixture(),
    before = structuredClone(doc);
  const result = JSON.parse(await (await exportStoryboard(doc, "json")).text());
  assert.deepEqual(
    result.scenes.map((scene) => [
      scene.id,
      scene.screenplayPage,
      scene.pageVersion.label,
    ]),
    [
      ["one", 1, "v2 Blue"],
      ["two", 2, "v5 Green"],
      ["three", 2, "v5 Green"],
    ],
  );
  assert.equal(result.scenes[1].title, "untitled");
  assert.equal(result.scenes[1].variant, "B");
  assert.deepEqual(
    result.scenes.flatMap((scene) =>
      scene.frames.map((frame) => frame.sequence),
    ),
    [1, 2, 3],
  );
  assert.deepEqual(result.scenes[2].frames, []);
  assert.equal(result.scenes[0].frames[1].image, null);
  assert.equal(result.scenes[0].frames[0].image, image);
  assert.equal(result.scenes[0].settings.drama, 0);
  assert.equal(result.scenes[0].settings.shootingDate, "2026-11-02");
  assert.deepEqual(doc, before);
});

test("sequence names identify pages, versions, scenes and frames, including safe Unicode and untitled", () => {
  const scenes = storyboardScenes(fixture());
  assert.equal(
    storyboardFrameFilename(scenes[0], 0, "png"),
    "page-001_v2-Blue_scene-001-A_ИНТ. ДОМ _ ДЕНЬ_ ВСТРЕЧА__frame-001.png",
  );
  assert.equal(
    storyboardFrameFilename(scenes[1], 0, "webp"),
    "page-002_v5-Green_scene-002-B_untitled_frame-001.webp",
  );
  const long = { ...scenes[0], title: "🐈Имя/".repeat(300) };
  assert.match(
    storyboardFrameFilename({ ...scenes[1], title: "UNTITLED" }, 0, "png"),
    /_untitled_frame-001\.png$/,
  );
  const first = storyboardFrameFilename(long, 0, "png");
  const second = storyboardFrameFilename(long, 1, "png");
  assert.notEqual(first, second);
  assert.ok(new TextEncoder().encode(first).length <= 240);
  assert.match(first, /^page-001_v2-Blue_scene-001-A_.*_frame-001\.png$/u);
  assert.ok(!/[<>:"/\\|?*\u0000-\u001f]/.test(first));
});

test("screenplay JSON preserves rich text, all original shot data and a page index without duplicating images", async () => {
  const doc = fixture();
  doc.content.content[0].content[0].marks = [
    { type: "telegraph" },
    { type: "bold" },
  ];
  const before = structuredClone(doc);
  const data = JSON.parse(await exportScreenplayJSON(doc).text());
  assert.equal(data.format, "tyter-screenplay");
  assert.deepEqual(data.content, doc.content);
  assert.deepEqual(data.sceneShots, doc.sceneShots);
  assert.deepEqual(data.pageVersions, doc.pageVersions);
  assert.equal(data.storyboard.scenes.length, 3);
  assert.equal("image" in data.storyboard.scenes[0].frames[0], false);
  assert.equal(data.storyboard.scenes[0].settings.aspectRatio, "2.39");
  assert.equal(data.storyboard.scenes[0].frames[0].durationMs, 1700);
  assert.equal(data.storyboard.scenes[0].frames[0].transition, "fade");
  assert.equal("history" in data, false);
  assert.deepEqual(
    validateImport(data).sceneShots,
    validateImport(doc).sceneShots,
  );
  assert.deepEqual(doc, before);
});
