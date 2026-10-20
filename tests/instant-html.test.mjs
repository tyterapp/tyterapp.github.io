import test from "node:test";
import assert from "node:assert/strict";
import { createProject } from "../src/data.js";
import { instantHTML } from "../src/instant-html.js";

test("read-only HTML contains both views, current frames, safe rich text and the free editor link", () => {
  const doc = createProject("<script>window.bad=true</script>");
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "scene", sceneVariant: "B" },
      content: [
        {
          type: "text",
          text: 'INT. ROOM <img src=x onerror="window.bad=true">',
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { format: "speech", blockId: "speech" },
      content: [
        {
          type: "text",
          text: "HELLO →",
          marks: [
            { type: "bold" },
            { type: "telegraph" },
            { type: "entity", attrs: { id: "c" } },
          ],
        },
      ],
    },
  ];
  doc.components = [{ id: "c", color: "#3d6fa0", url: "javascript:alert(1)" }];
  doc.sceneShots = {
    scene: {
      B: {
        drama: 0,
        frames: [
          {
            id: "f",
            image: "data:image/png;base64,aGVsbG8=",
            durationMs: 1700,
            transition: "fade",
          },
        ],
      },
    },
  };
  doc.notes = { content: { content: [{ text: "PRIVATE_NOTE" }] } };
  doc.comments = [{ text: "PRIVATE_COMMENT" }];
  const before = structuredClone(doc);
  const html = instantHTML(doc, {
    view: "storyboard",
    fonts: [{ style: "Regular", base64: "AAAA" }],
  });
  assert.match(html, /data-view="storyboard"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /id="screenplay"[^>]* hidden/);
  assert.match(html, /href="https:\/\/tyterapp.github.io\/free"/);
  assert.match(html, /data:font\/ttf;base64,AAAA/);
  assert.match(html, /data:image\/png;base64,aGVsbG8=/);
  assert.match(html, /<strong>HELLO/);
  assert.match(html, /class="telegram"/);
  assert.match(html, /class="arrow">→/);
  assert.match(html, /&lt;script&gt;window.bad=true&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>window.bad/);
  assert.doesNotMatch(html, /javascript:|onerror="window.bad/);
  assert.doesNotMatch(
    html,
    /PRIVATE_NOTE|PRIVATE_COMMENT|contenteditable|<input|<textarea/,
  );
  assert.match(html, /1\.7 с/);
  assert.deepEqual(doc, before);
  const data = JSON.parse(
    html.match(
      /<script type="application\/json" id="reader-data">([\s\S]*?)<\/script>/,
    )[1],
  );
  assert.equal(data.format, "tyter-screenplay");
  assert.equal(data.sceneShots.scene.B.frames[0].image, "");
  assert.equal(data.storyboard.scenes[0].frames[0].durationMs, 1700);
  assert.doesNotThrow(
    () => new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]),
  );
  assert.match(html, /id="reader-share"/);
  assert.match(html, /id="reader-download-menu"/);
  assert.match(html, /data-format="pdf"/);
});

test("HTML keeps selected page colors, label options, English and unillustrated scenes", () => {
  const doc = createProject("Story");
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "scene" },
      content: [{ type: "text", text: "A scene" }],
    },
  ];
  doc.pageVersions = {
    version: 1,
    mode: "colors",
    pages: [
      { id: "page", from: 0, to: 9, active: "blue", versions: {}, flow: true },
    ],
  };
  doc.settings.exportSceneNumbers = doc.settings.exportSceneVariants = false;
  const html = instantHTML(doc, {
    language: "en",
    editorURL: "javascript:bad()",
  });
  assert.match(html, /lang="en"/);
  assert.match(html, /v2 Blue/);
  assert.match(html, /No frames in this scene yet/);
  assert.match(html, /<span>Edit<\/span>/);
  assert.doesNotMatch(html, /class="scene-label"/);
  assert.doesNotMatch(html, /href="javascript:/);
});
