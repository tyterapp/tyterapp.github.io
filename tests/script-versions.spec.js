import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import { SCRIPT_VERSIONS } from "../src/script-versions.js";
import { ensurePageColors, setPageColor } from "../src/page-colors.js";

test("all nine production colors share one screenplay and never create copies", () => {
  let doc = ensurePageColors(createProject("Colors"));
  const content = doc.content;
  const id = doc.pageVersions.pages[0].id;
  for (const color of SCRIPT_VERSIONS) {
    doc = setPageColor(doc, id, color.id);
    expect(doc.content).toBe(content);
    expect(doc.pageVersions.pages[0].versions).toEqual({});
    expect(validateImport(doc).pageVersions.pages[0].active).toBe(color.id);
  }
});
