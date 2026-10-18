import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { scriptSearchMatches } from "../src/document-search.js";
import { switchScriptVersion } from "../src/script-versions.js";
import { ensurePageVersions, pageVersionSchema } from "../src/page-versions.js";

const paragraph = (format, text, blockId, sceneVariant) => ({
  type: "paragraph",
  attrs: { format, blockId, ...(sceneVariant ? { sceneVariant } : {}) },
  content: [{ type: "text", text }],
});
const scene = (letter = "A") =>
  paragraph("scene", "ИНТ. БАШНЯ — ДЕНЬ", "scene", letter);
function fixture(active = "white") {
  let doc = createProject("Поиск по копиям");
  doc.id = "search-script-versions";
  doc.content.content = [
    scene(),
    paragraph("action", "Белый маяк светит.", "target"),
  ];
  doc.sceneVariants = {
    scene: {
      F: [scene("F"), paragraph("action", "Скрытый белый маяк.", "hidden")],
    },
  };
  doc = switchScriptVersion(doc, "blue");
  doc.content.content = [
    scene(),
    ...Array.from({ length: 75 }, (_, index) =>
      paragraph(
        "action",
        `Проход ${index + 1}. ` + "Длинный коридор. ".repeat(5),
        `filler-${index}`,
      ),
    ),
    paragraph("action", "Синий маяк светит далеко.", "target"),
  ];
  doc.sceneVariants = {
    scene: {
      F: [scene("F"), paragraph("action", "Скрытый синий маяк.", "hidden")],
    },
  };
  doc = switchScriptVersion(doc, "pink");
  doc.content.content = [
    scene(),
    paragraph("action", "Розовый маяк светит.", "target"),
  ];
  doc.sceneVariants = {};
  return switchScriptVersion(doc, active);
}
test("legacy all-version search migrates live text and inactive scene alternatives into page context without mutating its input", () => {
  const document = fixture("blue");
  document.scriptVersions.blue = {
    content: {
      type: "doc",
      content: [paragraph("action", "Устаревший маяк.", "old")],
    },
  };
  const before = JSON.stringify(document);
  expect(
    scriptSearchMatches(document, "маяк").map(({ versionId }) => versionId),
  ).toEqual(["blue", "blue"]);
  // A live active branch wins over its stale cache. Imports sanitize inactive
  // caches the same way before the measured migration starts.
  const source = structuredClone(document);
  delete source.scriptVersions.blue;
  let boundary;
  pageVersionSchema.nodeFromJSON(source.content).forEach((block, position) => {
    if (block.attrs.blockId === "target") boundary = position;
  });
  const migrated = ensurePageVersions(source, [0, boundary], {
    legacyPlans: { white: [0], blue: [0, boundary], pink: [0] },
  });
  const matches = scriptSearchMatches(migrated, "маяк", "action", true);
  expect(
    matches.map(({ pageNumber, versionId, variant }) => [
      pageNumber,
      versionId,
      variant,
    ]),
  ).toEqual([
    [1, "white", "A"],
    [1, "white", "F"],
    [1, "blue", "F"],
    [1, "pink", "A"],
    [2, "blue", "A"],
  ]);
  expect(new Set(matches.map(({ pageId }) => pageId)).size).toBe(2);
  expect(matches.map(({ text }) => text).join(" ")).not.toContain("Устаревший");
  expect(scriptSearchMatches(migrated, "маяк", "scene", true)).toEqual([]);
  expect(scriptSearchMatches(migrated, "  ", "all", true)).toEqual([]);
  expect(JSON.stringify(document)).toBe(before);
  expect(Object.keys(migrated.scriptVersions)).toEqual([]);
  expect(Object.keys(migrated.pageVersions.legacyVersions).sort()).toEqual([
    "blue",
    "pink",
    "white",
  ]);
});
