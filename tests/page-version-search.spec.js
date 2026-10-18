import { test, expect } from "@playwright/test";
import { Transform } from "@tiptap/pm/transform";
import { createProject } from "../src/data.js";
import {
  ensurePageVersions,
  mapPageVersionRanges,
  pageVersionSchema,
  switchPageVersion,
} from "../src/page-versions.js";
import { searchMatchKey, scriptSearchMatches } from "../src/document-search.js";
import {
  SCRIPT_VERSIONS,
  scriptVersionExportStyle,
  scriptVersionGeometry,
} from "../src/script-version-colors.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});

function replaceText(document, blockId, text) {
  const node = pageVersionSchema.nodeFromJSON(document.content);
  let range;
  node.forEach((block, pos) => {
    if (block.attrs.blockId === blockId)
      range = { from: pos + 1, to: pos + block.nodeSize - 1 };
  });
  const transaction = new Transform(node).replaceWith(
    range.from,
    range.to,
    pageVersionSchema.text(text),
  );
  return mapPageVersionRanges(
    document,
    transaction.mapping,
    transaction.doc.toJSON(),
  );
}

function mixedFixture() {
  let document = createProject("Mixed page search");
  document.content.content = [
    paragraph("scene", "INT. LIGHTHOUSE — DAY", "scene-1"),
    paragraph("action", "White beacon on the first page.", "target-1"),
    paragraph("scene", "EXT. HARBOR — NIGHT", "scene-2"),
    paragraph("action", "White beacon on the second page.", "target-2"),
  ];
  const node = pageVersionSchema.nodeFromJSON(document.content);
  const boundary = node.child(0).nodeSize + node.child(1).nodeSize;
  document = ensurePageVersions(document, [0, boundary]);
  const [first, second] = document.pageVersions.pages;
  document = switchPageVersion(document, first.id, "blue");
  document = replaceText(
    document,
    "target-1",
    "Blue beacon on the first page.",
  );
  document = switchPageVersion(document, second.id, "pink");
  document = replaceText(
    document,
    "target-2",
    "Pink beacon on the second page.",
  );
  return document;
}

test("search uses each page's selected version and all-version results retain page identity", () => {
  let document = mixedFixture();
  const selected = scriptSearchMatches(document, "beacon");
  expect(
    selected.map(({ pageNumber, versionId, text }) => [
      pageNumber,
      versionId,
      text,
    ]),
  ).toEqual([
    [1, "blue", "Blue beacon on the first page."],
    [2, "pink", "Pink beacon on the second page."],
  ]);
  const all = scriptSearchMatches(document, "beacon", "action", true);
  expect(
    all.map(({ pageNumber, versionId }) => [pageNumber, versionId]),
  ).toEqual([
    [1, "white"],
    [1, "blue"],
    [2, "white"],
    [2, "pink"],
  ]);
  expect(new Set(all.map(searchMatchKey)).size).toBe(4);
  const target = all.find(
    ({ pageNumber, versionId }) => pageNumber === 1 && versionId === "white",
  );
  document = switchPageVersion(document, target.pageId, target.versionId);
  expect(document.pageVersions.pages.map(({ active }) => active)).toEqual([
    "white",
    "pink",
  ]);
  expect(
    scriptSearchMatches(document, "beacon").map(({ text }) => text),
  ).toEqual([
    "White beacon on the first page.",
    "Pink beacon on the second page.",
  ]);
  expect(
    scriptSearchMatches(document, "beacon", "all", true).map(searchMatchKey),
  ).toEqual(all.map(searchMatchKey));
  expect(scriptSearchMatches(document, "beacon", "character", true)).toEqual(
    [],
  );
  expect(scriptSearchMatches(document, " ", "all", true)).toEqual([]);
});

test("live edits replace stale active caches; inactive scene alternatives keep their owning page", () => {
  let document = mixedFixture();
  document = replaceText(
    document,
    "target-2",
    "Latest beacon on the second page.",
  );
  const second = document.pageVersions.pages[1];
  second.versions.pink = {
    slice: {
      content: [paragraph("action", "Stale beacon", "target-2")],
      openStart: 0,
      openEnd: 0,
    },
  };
  document.sceneVariants = {
    "scene-2": {
      F: [
        paragraph("scene", "EXT. HARBOR — DAWN", "scene-2"),
        paragraph("action", "Hidden beacon on the second page.", "hidden-2"),
      ],
    },
  };
  const matches = scriptSearchMatches(document, "beacon", "all", true);
  expect(matches.some(({ text }) => text.includes("Stale"))).toBe(false);
  expect(
    matches
      .filter(({ variant }) => variant === "F")
      .map(({ pageNumber, versionId }) => [pageNumber, versionId]),
  ).toEqual([
    [2, "white"],
    [2, "pink"],
  ]);
  expect(
    matches.find(
      ({ versionId, blockId }) =>
        versionId === "pink" && blockId === "target-2",
    ).text,
  ).toContain("Latest");
});

test("split paragraphs keep absolute caret offsets and cross-page phrases appear once", () => {
  let document = createProject("Split page search");
  document.content.content = [
    paragraph("action", "Prefix 012345 tail beacon.", "long"),
  ];
  document = ensurePageVersions(document, [0, 15]);
  const second = document.pageVersions.pages[1];
  document = switchPageVersion(document, second.id, "blue");
  const node = pageVersionSchema.nodeFromJSON(document.content);
  const transaction = new Transform(node).replaceWith(
    17,
    18,
    pageVersionSchema.text("l"),
  );
  document = mapPageVersionRanges(
    document,
    transaction.mapping,
    transaction.doc.toJSON(),
  );
  const all = scriptSearchMatches(document, "beacon", "all", true);
  expect(
    all.map(({ pageNumber, versionId, at }) => [pageNumber, versionId, at]),
  ).toEqual([
    [2, "white", 19],
    [2, "blue", 19],
  ]);
  const dormant = all.find(({ versionId }) => versionId === "white");
  expect(dormant.textOffset).toBe(14);
  expect(
    dormant.text.slice(
      dormant.at - dormant.textOffset,
      dormant.at - dormant.textOffset + dormant.length,
    ),
  ).toBe("beacon");
  expect(
    scriptSearchMatches(document, "012345 tall").map(
      ({ pageNumber }) => pageNumber,
    ),
  ).toEqual([1]);
});

test("a dormant split-page result keeps its identity when an earlier page changes the shared paragraph prefix", () => {
  let document = createProject("Shifted page prefix");
  document.content.content = [
    paragraph("action", "Prefix 012345 tail beacon.", "long"),
  ];
  document = ensurePageVersions(document, [0, 15]);
  const second = document.pageVersions.pages[1];
  document = switchPageVersion(document, second.id, "blue");
  const node = pageVersionSchema.nodeFromJSON(document.content);
  const transaction = new Transform(node).insert(
    3,
    pageVersionSchema.text("long "),
  );
  document = mapPageVersionRanges(
    document,
    transaction.mapping,
    transaction.doc.toJSON(),
  );
  const dormant = scriptSearchMatches(document, "beacon", "all", true).find(
    ({ versionId }) => versionId === "white",
  );
  expect(dormant.localAt).toBe(5);
  document = switchPageVersion(document, second.id, "white");
  const selected = scriptSearchMatches(document, "beacon")[0];
  expect(selected.at).toBe(24);
  expect(selected.localAt).toBe(5);
  expect(searchMatchKey(selected)).toBe(searchMatchKey(dormant));
});

test("every version has one distinct geometric identity and accessible export label ink", () => {
  const styles = SCRIPT_VERSIONS.map(({ id }) => scriptVersionExportStyle(id));
  expect(new Set(styles.map(({ shape }) => shape)).size).toBe(
    SCRIPT_VERSIONS.length,
  );
  const luminance = (hex) =>
    hex
      .slice(1)
      .match(/../g)
      .map((part) => parseInt(part, 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      )
      .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  for (const { id } of SCRIPT_VERSIONS) {
    const { color, ink, background, shape } = scriptVersionExportStyle(id);
    expect(scriptVersionGeometry(id).shape).toBe(shape);
    for (const base of [color, background])
      expect(
        (luminance(base) + 0.05) / (luminance(ink) + 0.05),
      ).toBeGreaterThan(7);
  }
  expect(scriptVersionExportStyle("constructor")).toEqual(
    scriptVersionExportStyle("white"),
  );
});
