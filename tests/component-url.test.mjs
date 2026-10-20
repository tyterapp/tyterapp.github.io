import { test } from "node:test";
import assert from "node:assert/strict";
import { componentUrl, activeComponentUrl } from "../src/component-url.js";
import { createProject, validateImport } from "../src/data.js";
import { pageVersionSchema } from "../src/page-versions.js";
import { instantHTML } from "../src/instant-html.js";
import {
  libraryFromDocument,
  mergeComponentLibrary,
} from "../src/component-library.js";
test("component URLs accept web links and reject executable or credentialed URLs", () => {
  assert.equal(
    componentUrl(" https://example.com/a?q=one#two "),
    "https://example.com/a?q=one#two",
  );
  assert.equal(componentUrl("www.example.com"), "https://www.example.com/");
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///C:/file",
    "https://name:secret@example.com",
    "words and text",
    "https://example.com\nhttps://another.com",
  ])
    assert.equal(componentUrl(url), "");
  assert.equal(
    activeComponentUrl({ url: "https://example.com", urlEnabled: false }),
    "",
  );
});

test("ordinary links persist independently of components, pagination and read-only exports; unsafe links are discarded", () => {
  const doc = createProject("Ordinary links");
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "linked" },
      content: [
        {
          type: "text",
          text: "Reference",
          marks: [
            {
              type: "link",
              attrs: { href: "https://example.com/research?q=one&next=two" },
            },
          ],
        },
        {
          type: "text",
          text: "Unsafe",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
      ],
    },
  ];
  const validated = validateImport(doc);
  assert.equal(validated.components.length, 0);
  assert.equal(validated.content.content[0].content[0].marks[0].type, "link");
  assert.equal(validated.content.content[0].content[1].marks, undefined);
  const content = pageVersionSchema.nodeFromJSON(validated.content).toJSON();
  assert.equal(
    content.content[0].content[0].marks[0].attrs.href,
    "https://example.com/research?q=one&next=two",
  );
  assert.match(
    instantHTML(validated),
    /href="https:\/\/example.com\/research\?q=one&amp;next=two"/,
  );
});
test("URLs and their independent switch survive TYT validation and component library import", () => {
  const doc = createProject("Links");
  doc.components = [
    {
      id: "cat",
      name: "Cat",
      type: "character",
      url: "https://example.com",
      urlEnabled: false,
    },
    { id: "bad", name: "Bad", url: "javascript:alert(1)" },
  ];
  const validated = validateImport(JSON.parse(JSON.stringify(doc)));
  assert.equal(validated.components[0].url, "https://example.com/");
  assert.equal(validated.components[0].urlEnabled, false);
  assert.equal(validated.components[1].url, undefined);
  const lib = libraryFromDocument(validated);
  const imported = mergeComponentLibrary(createProject("Other"), lib, [
    "cat",
  ]).document;
  assert.equal(imported.components[0].url, "https://example.com/");
  assert.equal(imported.components[0].urlEnabled, false);
});
