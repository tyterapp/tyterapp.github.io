import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { ensurePageColors, setPageColor } from "../src/page-colors.js";
import { ensurePageVersions } from "../src/page-versions.js";
import { scriptSearchMatches, searchMatchKey } from "../src/document-search.js";
import {
  SCRIPT_VERSIONS,
  scriptVersionExportStyle,
  scriptVersionGeometry,
} from "../src/script-version-colors.js";

test("search cards keep physical page identity and colors without searching dormant page copies", () => {
  const doc = createProject("Page search");
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "story" },
      content: [{ type: "text", text: "First beacon. Second beacon." }],
    },
  ];
  let next = ensurePageColors(ensurePageVersions(doc, [0, 14]));
  next = setPageColor(next, next.pageVersions.pages[0].id, "blue");
  next = setPageColor(next, next.pageVersions.pages[1].id, "pink");
  const matches = scriptSearchMatches(next, "beacon", "all", true);
  expect(
    matches.map(({ pageNumber, versionId }) => [pageNumber, versionId]),
  ).toEqual([
    [1, "blue"],
    [2, "pink"],
  ]);
  expect(new Set(matches.map(searchMatchKey)).size).toBe(2);
  expect(scriptSearchMatches(next, "beacon. Second")).toHaveLength(1);
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
