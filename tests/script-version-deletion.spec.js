import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { ensurePageColors, setPageColor } from "../src/page-colors.js";
import { removePageVersion, restorePageVersion } from "../src/page-versions.js";

test("colored sheets have no removable or restorable text copies", () => {
  let doc = ensurePageColors(createProject("Colors"));
  const id = doc.pageVersions.pages[0].id;
  doc = setPageColor(doc, id, "blue");
  expect(removePageVersion(doc, id, "blue")).toBeNull();
  expect(restorePageVersion(doc, id, "pink", { slice: { content: [] } })).toBe(
    doc,
  );
  expect(doc.pageVersions.pages[0].active).toBe("blue");
});
