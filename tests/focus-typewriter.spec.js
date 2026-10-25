import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
test.use({ serviceWorkers: "block" });
test.setTimeout(60000);
async function open(page, theme = "dark", width = 1440, long = false) {
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.setViewportSize({ width, height: 1000 });
  const doc = createProject("Typewriter fixture");
  doc.id = "focus-typewriter";
  doc.content.content = [
    "scene",
    "action",
    "character",
    "speech",
    "parenthetical",
    "transition",
    "plain",
  ].map((format, i) => ({
    type: "paragraph",
    attrs: { format, blockId: `f-${i}` },
    content: [
      {
        type: "text",
        text: i === 0 ? "INT. ROOM — DAY" : i === 2 ? "ANNA" : "Hello world",
      },
    ],
  }));
  doc.components = [
    { id: "anna", name: "ANNA", type: "character", color: "#9977aa" },
  ];
  if (long)
    doc.content.content.push(
      ...Array.from({ length: 60 }, (_, i) => ({
        type: "paragraph",
        attrs: { format: "action", blockId: `long-${i}` },
        content: [
          {
            type: "text",
            text: "A long synthetic paragraph for checking original page boundaries. ".repeat(
              5,
            ),
          },
        ],
      })),
    );
  await page.addInitScript(
    ({ doc, theme }) => {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.editor-intro.v1", "seen");
      localStorage.setItem("tyter.language.v1", "en");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
    },
    { doc, theme },
  );
  await page.goto("/free", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
test("desktop dark fullscreen activates the supplied typewriter and lamp with compact format gaps", async ({
  page,
}, info) => {
  await open(page);
  await page.locator('[data-block-id="f-1"]').click();
  await page.locator(".focus-mode-toggle").click();
  await page.locator(".focus-typewriter-button").click();
  await expect(page.locator(".typewriter-rig")).toBeVisible();
  await expect(page.locator(".focus-lamp-button")).toBeVisible();
  await expect(page.locator(".typewriter-format")).toHaveAttribute(
    "data-format",
    "action",
  );
  const gaps = await page
    .locator(".screenplay-block")
    .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).marginBottom));
  expect(gaps.every((gap) => gap === "4px")).toBe(true);
  await page.screenshot({ path: info.outputPath("typewriter-off.png") });
});

async function activate(page, width = 1440) {
  await open(page, "dark", width);
  await page.locator('[data-block-id="f-1"]').click();
  await page.locator(".focus-mode-toggle").click();
  await page.locator(".focus-typewriter-button").click();
  await expect(page.locator(".typewriter-rig")).toBeVisible();
}
async function selectBlock(page, id, offset = 1) {
  await page.locator(".screenplay-editor").evaluate(
    (dom, { id, offset }) => {
      let position;
      dom.editor.state.doc.descendants((node, pos) => {
        if (node.attrs.blockId === id)
          position = pos + 1 + Math.min(offset, node.content.size);
      });
      dom.editor.commands.setTextSelection(position);
      dom.focus({ preventScroll: true });
    },
    { id, offset },
  );
}
const editorState = (page) =>
  page.locator(".screenplay-editor").evaluate((dom) => ({
    doc: dom.editor.getJSON(),
    head: dom.editor.state.selection.head,
  }));

test("format icon follows every screenplay format and blue bulb detects characters, links and plain text", async ({
  page,
}, info) => {
  await activate(page);
  const formats = [
    "scene",
    "action",
    "character",
    "speech",
    "parenthetical",
    "transition",
    "plain",
  ];
  const files = [
    "INT-EXT.svg",
    "Action.svg",
    "Charachter.svg",
    "Speal.svg",
    "Remark.svg",
    "Cut.svg",
    "Plain-text.svg",
  ];
  for (const lamp of ["off", "on"]) {
    if (lamp === "on") await page.locator(".focus-lamp-button").click();
    await expect(page.locator(".typewriter-rig")).toHaveAttribute(
      "data-lamp",
      lamp,
    );
    for (let i = 0; i < formats.length; i++) {
      await selectBlock(page, `f-${i}`, 2);
      const icon = page.locator(".typewriter-format");
      await expect(icon).toHaveAttribute("data-format", formats[i]);
      await expect(icon).toHaveAttribute(
        "src",
        `/typewriter/formats/${files[i]}`,
      );
      await expect
        .poll(() =>
          icon.evaluate(
            (img) =>
              img.complete &&
              img.naturalWidth === 18 &&
              img.naturalHeight === 18,
          ),
        )
        .toBe(true);
      await expect(icon).toHaveCSS("width", "18px");
      await expect(icon).toHaveCSS("height", "18px");
      await page.locator(".typewriter-body").screenshot({
        path: info.outputPath(`format-${formats[i]}-${lamp}.png`),
      });
    }
  }
  await selectBlock(page, "f-2", 2);
  await expect(page.locator(".typewriter-blue")).toHaveAttribute(
    "data-on",
    "true",
  );
  await selectBlock(page, "f-1", 2);
  await expect(page.locator(".typewriter-blue")).toHaveAttribute(
    "data-on",
    "false",
  );
  await page.locator(".screenplay-editor").evaluate((dom) => {
    const editor = dom.editor,
      { $head } = editor.state.selection;
    editor.view.dispatch(
      editor.state.tr.addMark(
        $head.start(),
        $head.start() + 5,
        editor.schema.marks.link.create({ href: "https://example.test" }),
      ),
    );
  });
  await expect(page.locator(".typewriter-blue")).toHaveAttribute(
    "data-on",
    "true",
  );
});

test("red spelling bulb checks the local dictionary and clears when caret moves to a correct word", async ({
  page,
}) => {
  await activate(page);
  await selectBlock(page, "f-1", 5);
  await expect(page.locator(".typewriter-red")).toHaveAttribute(
    "data-on",
    "false",
  );
  await page.keyboard.press("Home");
  await page.keyboard.insertText("qzzxqzz ");
  await selectBlock(page, "f-1", 3);
  await expect(page.locator(".typewriter-red")).toHaveAttribute(
    "data-on",
    "true",
    { timeout: 15000 },
  );
  await selectBlock(page, "f-1", 10);
  await expect(page.locator(".typewriter-red")).toHaveAttribute(
    "data-on",
    "false",
  );
});

test("lamp crossfades for one second, clicks once per press and preserves document and selection", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.lampClicks = 0;
    const native = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      window.lampClicks++;
      return native.apply(this, args);
    };
  });
  await activate(page);
  const before = await editorState(page);
  const beam = page.locator(".typewriter-beam");
  await expect(beam).toHaveCSS("transition-duration", "1s");
  await expect(beam).toHaveCSS("transition-timing-function", "ease-in-out");
  await page.locator(".focus-lamp-button").click();
  await expect(page.locator(".typewriter-rig")).toHaveAttribute(
    "data-lamp",
    "on",
  );
  await expect(beam).toHaveCSS("opacity", "0.8");
  await expect(page.locator(".script-paper")).toHaveCSS(
    "background-color",
    "rgb(10, 9, 12)",
  );
  await expect(page.locator(".minimal-app")).toHaveCSS(
    "background-color",
    "rgb(18, 16, 21)",
  );
  await expect(page.locator(".minimal-scroll")).toHaveCSS(
    "background-color",
    "rgb(18, 16, 21)",
  );
  expect(await page.evaluate(() => window.lampClicks)).toBe(1);
  expect(await editorState(page)).toEqual(before);
  await page.screenshot({ path: info.outputPath("typewriter-lamp-on.png") });
  await page.locator(".focus-lamp-button").click();
  await expect(beam).toHaveCSS("opacity", "0");
  expect(await page.evaluate(() => window.lampClicks)).toBe(2);
});

test("dragging bg moves the rail vertically, only the carriage horizontally, and the actual text caret on both axes", async ({
  page,
}, info) => {
  await activate(page);
  await selectBlock(page, "f-1", 1);
  await expect
    .poll(async () => {
      const body = await page.locator(".typewriter-carriage").boundingBox();
      const caret = await page
        .locator(".screenplay-editor")
        .evaluate(
          (dom) =>
            dom.editor.view.coordsAtPos(dom.editor.state.selection.head).left,
        );
      return body.x + 32 - caret;
    })
    .toBeCloseTo(0, 0);
  const before = await editorState(page);
  const carriage = page.locator(".typewriter-carriage"),
    rail = page.locator(".typewriter-rig"),
    tube = page.locator(".typewriter-tube");
  const body = await carriage.boundingBox(),
    initialRail = await rail.boundingBox(),
    initialTube = await tube.boundingBox();
  const x = body.x + 32,
    y = body.y + 20;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 65, y, { steps: 5 });
  expect((await rail.boundingBox()).y).toBeCloseTo(initialRail.y, 0);
  expect((await tube.boundingBox()).x).toBeCloseTo(initialTube.x, 0);
  expect((await carriage.boundingBox()).x).toBeCloseTo(body.x + 65, 0);
  expect((await editorState(page)).head).not.toBe(before.head);
  const horizontalCaret = (await editorState(page)).head;
  await page.mouse.move(x + 65, y + 110, { steps: 7 });
  expect((await rail.boundingBox()).y).toBeCloseTo(initialRail.y + 110, 0);
  expect((await carriage.boundingBox()).x).toBeCloseTo(body.x + 65, 0);
  expect((await editorState(page)).head).not.toBe(horizontalCaret);
  expect((await editorState(page)).doc).toEqual(before.doc);
  await page.mouse.up();
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.keyboard.insertText("!");
  await expect(page.locator(".screenplay-editor")).toContainText("!");
  await page.screenshot({ path: info.outputPath("typewriter-dragged.png") });
});

test("100 to 200 percent zoom stretches only Tube width and keeps fixed physical sizes of all other parts", async ({
  page,
}, info) => {
  await activate(page, 2400);
  const parts =
    ".typewriter-body,.typewriter-cap,.typewriter-cursor,.typewriter-bulb,.typewriter-format,.typewriter-beam";
  const sizes = () =>
    page.locator(parts).evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { width: r.width, height: r.height };
      }),
    );
  const before = await sizes(),
    tube = await page.locator(".typewriter-tube").boundingBox();
  const content = await editorState(page);
  for (let i = 0; i < 10; i++)
    await page
      .locator(".script-paper")
      .dispatchEvent("wheel", { ctrlKey: true, deltaY: -100 });
  await expect(page.locator(".script-paper")).toHaveCSS("zoom", "2");
  await expect
    .poll(
      async () => (await page.locator(".typewriter-tube").boundingBox()).width,
    )
    .toBeCloseTo(tube.width * 2, 0);
  expect((await page.locator(".typewriter-tube").boundingBox()).height).toBe(
    tube.height,
  );
  expect(await sizes()).toEqual(before);
  expect(await editorState(page)).toEqual(content);
  await page.screenshot({ path: info.outputPath("typewriter-zoom-200.png") });
});

test("leaving dark fullscreen resets machine, lamp and spacing without changing content", async ({
  page,
}) => {
  await activate(page);
  const before = await editorState(page);
  await page.locator(".focus-lamp-button").click();
  await page.locator(".focus-theme-button").click();
  await expect(
    page.locator(".typewriter-rig,.focus-lamp-button,.focus-typewriter-button"),
  ).toHaveCount(0);
  await expect(page.locator('[data-block-id="f-1"]')).not.toHaveCSS(
    "margin-bottom",
    "4px",
  );
  await page.locator(".focus-theme-button").click();
  await expect(page.locator(".focus-typewriter-button")).toBeVisible();
  await expect(page.locator(".typewriter-rig")).toHaveCount(0);
  await page.locator(".focus-typewriter-button").click();
  await expect(page.locator(".typewriter-rig")).toHaveAttribute(
    "data-lamp",
    "off",
  );
  await page.locator(".focus-mode-toggle").click();
  await expect(page.locator(".typewriter-rig,.focus-lamp-button")).toHaveCount(
    0,
  );
  expect(await editorState(page)).toEqual(before);
});

test("mobile resize removes desktop apparatus and reduced motion disables lamp animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await activate(page);
  await expect(page.locator(".typewriter-beam")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".typewriter-rig,.focus-lamp-button")).toHaveCount(
    0,
  );
  await expect(page.locator('[data-block-id="f-1"]')).not.toHaveCSS(
    "margin-bottom",
    "4px",
  );
  await expect(page.locator(".focus-typewriter-button svg")).toBeVisible();
  await page.locator(".focus-typewriter-button").click();
  await expect(page.locator(".typewriter-rig")).toHaveCount(0);
});

test("compact presentation keeps canonical page boundaries, restores normal pages and excludes the apparatus from print", async ({
  page,
}) => {
  await open(page, "dark", 1440, true);
  await expect
    .poll(() => page.locator(".page-version-control").count())
    .toBeGreaterThan(3);
  const storedPages = () =>
    page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("tyter.projects.v1"),
      )[0].pageVersions?.pages?.map((p) => [p.from, p.to]),
    );
  await expect.poll(storedPages).toBeTruthy();
  const pages = await storedPages(),
    before = await editorState(page);
  const initialHeight = await page
    .locator(".script-paper")
    .evaluate((n) => n.getBoundingClientRect().height);
  await page.locator(".focus-mode-toggle").click();
  await page.locator(".focus-typewriter-button").click();
  await expect(page.locator(".typewriter-rig")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".script-paper")
        .evaluate((n) => n.getBoundingClientRect().height),
    )
    .toBeLessThan(initialHeight);
  await expect.poll(storedPages).toEqual(pages);
  await expect(page.locator(".page-version-control")).toHaveCount(pages.length);
  expect((await editorState(page)).doc).toEqual(before.doc);
  await page.emulateMedia({ media: "print" });
  await expect(
    page.locator(".typewriter-rig,.focus-lamp-button").first(),
  ).toBeHidden();
  await expect(page.locator('[data-block-id="f-1"]')).not.toHaveCSS(
    "margin-bottom",
    "4px",
  );
  await page.emulateMedia({ media: "screen" });
  await page.locator(".focus-mode-toggle").click();
  await expect
    .poll(() => page.locator(".page-guide").count())
    .toBe(pages.length);
  await expect.poll(storedPages).toEqual(pages);
});

test("unavailable dictionary never leaves a stale red light, and Escape during dragging cleans up capture", async ({
  page,
}) => {
  await page.route("**/dictionary/words.txt", (route) =>
    route.fulfill({ status: 404 }),
  );
  await activate(page);
  await selectBlock(page, "f-1", 1);
  await page.keyboard.press("Home");
  await page.keyboard.insertText("qzzxqzz ");
  await selectBlock(page, "f-1", 3);
  await expect(page.locator(".typewriter-red")).toHaveAttribute(
    "data-on",
    "true",
    { timeout: 15000 },
  );
  await page.keyboard.press("End");
  await page.keyboard.insertText(" неправельна ");
  await selectBlock(page, "f-1", 23);
  await expect(page.locator(".typewriter-red")).toHaveAttribute(
    "data-on",
    "false",
  );
  const body = await page.locator(".typewriter-carriage").boundingBox();
  await page.mouse.move(body.x + 32, body.y + 20);
  await page.mouse.down();
  await page.mouse.move(body.x + 48, body.y + 40);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".typewriter-rig,.focus-lamp-button")).toHaveCount(
    0,
  );
  await expect(page.locator(".screenplay-editor")).toBeFocused();
  await page.locator(".focus-mode-toggle").click();
  await page.locator(".focus-typewriter-button").click();
  await expect(page.locator(".typewriter-rig")).toBeVisible();
});

test("silent content replacement at the same caret position refreshes the spelling light", async ({
  page,
}) => {
  await activate(page);
  await selectBlock(page, "f-1", 2);
  const replaceWord = (word, silent) =>
    page.locator(".screenplay-editor").evaluate(
      (dom, { word, silent }) => {
        const editor = dom.editor,
          state = editor.state;
        const start = state.selection.$head.start();
        const tr = state.tr.insertText(word, start, start + 5);
        tr.setSelection(
          state.selection.constructor.create(tr.doc, state.selection.head),
        );
        if (silent) tr.setMeta("preventUpdate", true);
        editor.view.dispatch(tr);
      },
      { word, silent },
    );
  await replaceWord("qzzxx", false);
  await expect(page.locator(".typewriter-red")).toHaveAttribute(
    "data-on",
    "true",
    { timeout: 15000 },
  );
  const position = (await editorState(page)).head;
  await replaceWord("Hello", true);
  expect((await editorState(page)).head).toBe(position);
  await expect(page.locator(".typewriter-red")).toHaveAttribute(
    "data-on",
    "false",
  );
});

test("lamp uses all nine exact page colors without a sheet outline and restores the normal theme", async ({
  page,
}, info) => {
  await activate(page);
  await page.locator(".focus-lamp-button").click();
  const palette = [
    ["white", "10, 9, 12"],
    ["blue", "6, 9, 13"],
    ["pink", "15, 9, 12"],
    ["yellow", "21, 20, 17"],
    ["green", "11, 15, 11"],
    ["goldenrod", "20, 17, 11"],
    ["buff", "17, 14, 11"],
    ["salmon", "21, 16, 15"],
    ["cherry", "15, 8, 10"],
  ];
  const picker = page
    .locator(".page-version-control .script-version-trigger")
    .first();
  for (const [id, rgb] of palette) {
    await picker.click();
    await page.getByRole("listbox").locator(`[data-value="${id}"]`).click();
    await expect(page.locator(".revision-page-background").first()).toHaveCSS(
      "background-color",
      `rgb(${rgb})`,
    );
    await expect(page.locator(".script-paper")).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".script-paper")).toHaveCSS(
      "border-top-width",
      "0px",
    );
    await expect(page.locator(".minimal-app")).toHaveCSS(
      "background-color",
      "rgb(18, 16, 21)",
    );
  }
  await page.screenshot({ path: info.outputPath("lamp-cherry.png") });
  await page.locator(".focus-lamp-button").click();
  await expect(page.locator(".revision-page-background").first()).not.toHaveCSS(
    "background-color",
    "rgb(15, 8, 10)",
  );
  await expect(page.locator(".script-paper")).not.toHaveCSS(
    "box-shadow",
    "none",
  );
});

test("rig and beam retain their requested offsets, the format icon alignment and the cap contact", async ({
  page,
}) => {
  await activate(page);
  const rects = await page.evaluate(() => {
    const rect = (selector) =>
      document.querySelector(selector).getBoundingClientRect().toJSON();
    const dom = document.querySelector(".screenplay-editor");
    return {
      rail: rect(".typewriter-rig"),
      body: rect(".typewriter-carriage"),
      beam: rect(".typewriter-beam"),
      format: rect(".typewriter-format"),
      cap: rect(".typewriter-left .typewriter-off"),
      paper: rect(".script-paper"),
      caret: dom.editor.view.coordsAtPos(dom.editor.state.selection.head),
    };
  });
  expect(
    rects.rail.top - (rects.caret.top + rects.caret.bottom) / 2,
  ).toBeCloseTo(20, 0);
  expect(
    rects.beam.left +
      rects.beam.width / 2 -
      rects.body.left -
      rects.body.width / 2,
  ).toBeCloseTo(7, 0);
  expect(rects.format.top - rects.body.top).toBe(12);
  // Left SVG's visible path ends at x=22 within its 36px viewBox.
  expect(rects.cap.left + 22).toBeCloseTo(rects.paper.left, 0);
});

test("scene suggestions sit six pixels below the carriage, follow zoom and accept input", async ({
  page,
}, info) => {
  await activate(page);
  await page.locator(".focus-lamp-button").click();
  await page.locator(".screenplay-editor").evaluate((dom) => {
    const editor = dom.editor,
      end = editor.state.doc.firstChild.content.size + 1;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: 1, to: end })
      .deleteSelection()
      .setTextSelection(1)
      .run();
  });
  expect((await editorState(page)).doc.content[0].content || []).toEqual([]);
  const popup = page.getByRole("listbox", { name: "Suggestions", exact: true });
  await expect(popup).toBeVisible();
  const follows = async () => {
    await expect
      .poll(async () => {
        const box = await popup.boundingBox(),
          body = await page.locator(".typewriter-body").boundingBox();
        return {
          gap: Math.round(box.y - body.y - body.height),
          left: Math.round(box.x - body.x),
        };
      })
      .toEqual({ gap: 6, left: 0 });
  };
  await follows();
  for (let i = 0; i < 10; i++)
    await page
      .locator(".script-paper")
      .dispatchEvent("wheel", { ctrlKey: true, deltaY: -100 });
  await expect(page.locator(".script-paper")).toHaveCSS("zoom", "2");
  await follows();
  await page.screenshot({
    path: info.outputPath("suggestions-below-typewriter.png"),
  });
  await page.keyboard.press("Control+Enter");
  await expect(page.locator('[data-block-id="f-0"]')).toContainText("INT.");
});

test("component replacement picker also stays below the carriage and preserves keyboard selection", async ({
  page,
}) => {
  await activate(page);
  await selectBlock(page, "f-1", 2);
  await page.locator(".screenplay-editor").evaluate((dom) => {
    const editor = dom.editor,
      start = editor.state.selection.$head.start();
    editor.view.dispatch(
      editor.state.tr.addMark(
        start,
        start + 5,
        editor.schema.marks.entity.create({ id: "anna", automatic: false }),
      ),
    );
  });
  await page.locator('[data-block-id="f-1"] [data-entity-id="anna"]').click();
  const popup = page.getByRole("listbox", {
    name: "Change component",
    exact: true,
  });
  await expect(popup).toBeVisible();
  await expect
    .poll(async () => {
      const box = await popup.boundingBox(),
        body = await page.locator(".typewriter-body").boundingBox();
      return {
        gap: Math.round(box.y - body.y - body.height),
        left: Math.round(box.x - body.x),
      };
    })
    .toEqual({ gap: 6, left: 0 });
  await page.keyboard.press("Enter");
  await expect(popup).toHaveCount(0);
  await expect(page.locator('[data-block-id="f-1"]')).toContainText(
    "Hello world",
  );
});
