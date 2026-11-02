import { test } from "node:test";
import assert from "node:assert/strict";
import {
  storyboardSearchMatches,
  storyboardSearchScenes,
} from "../src/storyboard-search.js";

const frame = (id, extra = {}) => ({
  id,
  image: "",
  durationMs: 5000,
  ...extra,
});
const scene = (extra = {}) => ({
  id: "scene-one",
  number: 1,
  letter: "A",
  page: 1,
  title: "ИНТ. ДОМ — ДЕНЬ",
  settings: { frames: [frame("frame-one")] },
  ...extra,
});

test("search finds the displayed title of unnamed scenes, including scenes without frames", () => {
  const scenes = [
    scene({ title: "  " }),
    scene({ id: "empty", title: "", settings: {} }),
  ];
  const found = storyboardSearchMatches(scenes, "БЕЗ НАЗВАНИЯ");
  assert.deepEqual(
    found.map(({ sceneId, frameId, title }) => [sceneId, frameId, title]),
    [
      ["scene-one", "frame-one", "Без названия"],
      ["empty", null, "Без названия"],
    ],
  );
  assert.equal(storyboardSearchMatches(scenes, "Untitled", "en").length, 2);
});

test("scene captions and localized settings find every frame across pages", () => {
  const scenes = [
    scene(),
    scene({
      id: "late",
      page: 7,
      letter: "C",
      number: 9,
      settings: {
        synopsis: "Герой ждёт рассвет",
        frameComment: "Снять через стекло",
        frameSize: "close",
        frames: [frame("late-one"), frame("late-two")],
      },
    }),
  ];
  for (const query of ["рассвет", "через стекло", "Крупный"])
    assert.deepEqual(
      storyboardSearchMatches(scenes, query).map(({ frameId }) => frameId),
      ["late-one", "late-two"],
    );
  const result = storyboardSearchMatches(scenes, "Close up", "en")[1];
  assert.deepEqual(
    [
      result.sceneId,
      result.variant,
      result.pageNumber,
      result.sceneNumber,
      result.frameNumber,
    ],
    ["late", "C", 7, 9, 2],
  );
  assert.equal(
    result.text.slice(result.at, result.at + result.length),
    "Close up",
  );
});

test("frame comments, replies and layer names find only their owning frame", () => {
  const scenes = [
    scene({
      settings: {
        frames: [
          frame("one", {
            comments: [
              {
                id: "comment",
                text: "Дождь",
                replies: [{ id: "reply", text: "Капли на окне" }],
              },
            ],
          }),
          frame("two", {
            layers: [{ id: "layer", name: "Красный силуэт", visible: true }],
          }),
        ],
      },
    }),
  ];
  for (const query of ["дождь", "капли"])
    assert.deepEqual(
      storyboardSearchMatches(scenes, query).map(({ frameId }) => frameId),
      ["one"],
    );
  assert.deepEqual(
    storyboardSearchMatches(scenes, "силуэт").map(({ frameId }) => frameId),
    ["two"],
  );
});

test("one card per frame retains stable identity and drawing data after reordering", () => {
  const first = frame("first", {
    layers: [
      {
        id: "ink",
        type: "path",
        points: [
          [0, 0],
          [1, 1],
        ],
      },
    ],
  });
  const second = frame("second");
  const scenes = [
    scene({ title: "Море море", settings: { frames: [first, second] } }),
  ];
  const before = structuredClone(scenes);
  const results = storyboardSearchMatches(scenes, "море");
  assert.equal(results.length, 2);
  assert.equal(results[0].frame, first);
  assert.equal(results[0].frame.layers[0].id, "ink");
  const reordered = storyboardSearchMatches(
    [scene({ title: "Море море", settings: { frames: [second, first] } })],
    "море",
  );
  assert.equal(results[0].key, reordered[1].key);
  assert.deepEqual(scenes, before);
});

test("blank queries and hidden implementation data do not produce matches", () => {
  const scenes = [
    scene({
      id: "secret-id",
      settings: {
        frames: [
          frame("secret-frame", {
            image: "data:image/png;base64,secret-image",
          }),
        ],
      },
    }),
  ];
  for (const query of ["", "   ", "secret", "base64"])
    assert.deepEqual(storyboardSearchMatches(scenes, query), []);
});

test("search scene sources retain all existing alternatives and their live page positions", () => {
  const p = (id, text, letter = "A") => ({
    type: "paragraph",
    attrs: { format: "scene", blockId: id, sceneVariant: letter },
    content: [{ type: "text", text }],
  });
  const doc = {
    content: { type: "doc", content: [p("one", "Дом"), p("two", "Лес", "B")] },
    pageVersions: {
      pages: [
        { id: "page-one", from: 0, to: 5, active: "white" },
        { id: "page-two", from: 5, to: 10, active: "blue" },
      ],
    },
    sceneVariants: { two: { A: [p("two", "Река")] } },
    sceneShots: {
      two: {
        A: { frameComment: "Искра", frames: [frame("alternative")] },
        B: { frames: [frame("live")] },
      },
    },
  };
  const sources = storyboardSearchScenes(doc);
  assert.deepEqual(
    sources.map(({ id, letter, page, pageId }) => [id, letter, page, pageId]),
    [
      ["one", "A", 1, "page-one"],
      ["two", "A", 2, "page-two"],
      ["two", "B", 2, "page-two"],
    ],
  );
  const result = storyboardSearchMatches(sources, "искра")[0];
  assert.deepEqual(
    [result.sceneId, result.variant, result.frameId, result.pageNumber],
    ["two", "A", "alternative", 2],
  );
});
