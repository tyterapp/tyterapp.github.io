import test from "node:test";
import assert from "node:assert/strict";
import * as data from "../src/storyboard-data.js";
import * as generation from "../src/storyboard-generation.js";
import { createProject } from "../src/data.js";
import { storyboardManifest } from "../src/storyboard-export.js";

const image = "data:image/png;base64,aGVsbG8=";
const drawing = { id: "ink", name: "Sketch", type: "path", points: [[.1, .2], [.7, .8]], color: "#123456", width: 3, visible: true };

test("moving a layer against the frame edge preserves its shape", () => {
  assert.equal(typeof data.moveFrameLayer, "function");
  const next = data.moveFrameLayer(drawing, .8, -.7);
  assert.deepEqual(next.points, [[.4, 0], [1, .6]]);
  assert.deepEqual(drawing.points, [[.1,.2],[.7,.8]]);
});

test("image layers retain their safe source and geometry through validation", () => {
  const [frame] = data.cleanFrames([{ id: "f", layers: [{ id: "photo", name: "Photo", type: "image", image, points: [[.2, .3], [.8, .7]], visible: true }, { id: "unsafe", type: "image", image: "https://tracker.test/image.png", points: [[0,0],[1,1]] }] }]);
  assert.equal(frame.layers.length, 1);
  assert.equal(frame.layers[0].type, "image");
  assert.equal(frame.layers[0].image, image);
  assert.deepEqual(frame.layers[0].points, [[.2,.3],[.8,.7]]);
});

test("visible drawing and image layers count as frame content while pins and hidden layers do not", () => {
  assert.equal(typeof data.frameHasContent, "function");
  assert.equal(data.frameHasContent({ layers: [drawing] }), true);
  assert.equal(data.frameHasContent({ image }), true);
  assert.equal(data.frameHasContent({ layers: [{ ...drawing, visible: false }], comments: [{ text: "pin" }] }), false);
  assert.equal(data.frameHasContent({ layers: [{ ...drawing, points: [] }] }), false);
  assert.equal(data.frameHasContent({ layers: [{ type: "image", image, points: [[0,0],[1,1]] }] }), true);
});

test("hover playback includes frames made only from drawing layers", async () => {
  const seen = [];
  const stop = data.playSlides({ frames: [{ id: "a", layers: [drawing], durationMs: 100 }, { id: "b", layers: [drawing], durationMs: 100 }], playbackLoop: false }, (frame) => seen.push(frame.id));
  await new Promise((resolve) => setTimeout(resolve, 230));
  stop();
  assert.deepEqual(seen, ["b", "a"]);
});

test("portable storyboard preserves editable layers and frame comments without aliasing", () => {
  const doc = createProject("Layers");
  doc.content.content = [{ type: "paragraph", attrs: { format: "scene", blockId: "one" }, content: [{ type: "text", text: "INT. ROOM" }] }];
  doc.sceneShots = { one: { A: { frames: [{ id: "f", layers: [drawing], comments: [{ id: "c", x: .2, y: .3, text: "Review", replies: [] }] }] } } };
  const manifest = storyboardManifest(doc);
  const frame = manifest.scenes[0].frames[0];
  assert.deepEqual(frame.layers, [drawing]);
  assert.equal(frame.comments[0].text, "Review");
  frame.layers[0].name = "Changed export";
  assert.equal(doc.sceneShots.one.A.frames[0].layers[0].name, "Sketch");
});

test("frame generation context contains the selected visual references and shot settings", () => {
  assert.equal(typeof generation.frameGenerationContext, "function");
  const scene = { id: "one", title: "INT. STUDIO", settings: { synopsis: "A reunion", aspectRatio: "2.39", lighting: "soft", shotType: "shoulder" }, blocks: [] };
  const context = generation.frameGenerationContext(scene, { frameId: "f", character: { id: "hero", name: "HERO", description: "Red coat" }, location: { id: "room", name: "STUDIO", description: "Brick walls" }, frameSize: "close" });
  assert.equal(context.sceneId, "one");
  assert.equal(context.frameId, "f");
  assert.equal(context.character.id, "hero");
  assert.equal(context.location.id, "room");
  assert.equal(context.shotSettings.frameSize, "close");
  assert.equal(context.shotSettings.lighting, "soft");
  assert.match(context.description, /Red coat/);
  assert.match(context.description, /Brick walls/);
  assert.match(context.description, /Close up/);
  assert.match(context.description, /Soft light/);
});
