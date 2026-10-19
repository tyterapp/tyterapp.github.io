import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import { scriptSearchMatches } from "../src/document-search.js";

test("search ignores document-wide archives and historical snapshots", () => {
  const doc = createProject("Search");
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { blockId: "live", format: "action" },
      content: [{ type: "text", text: "Visible beacon" }],
    },
  ];
  doc.scriptVersions = {
    blue: {
      ...doc,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: "old", format: "action" },
            content: [{ type: "text", text: "Archived beacon" }],
          },
        ],
      },
    },
  };
  const next = validateImport(doc);
  expect(scriptSearchMatches(next, "beacon", "all", true)).toHaveLength(1);
  expect(scriptSearchMatches(next, "Archived", "all", true)).toHaveLength(0);
  expect(next.scriptVersions).toEqual({});
});
