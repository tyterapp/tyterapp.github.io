import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createProject, validateImport } from "../src/data.js";
import { componentReportRows } from "../src/component-report.js";
import {
  libraryFromDocument,
  readComponentLibrary,
  mergeComponentLibrary,
} from "../src/component-library.js";
import { exportPropsPDF } from "../src/exports.js";
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;
globalThis.Path2D = Path2D;
globalThis.location ||= { protocol: "https:" };
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const { readTYT, tytPayload } = await import("../src/tyt-format.js");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) =>
  String(url).startsWith("/fonts/")
    ? new Response(await readFile(new URL(`../public${url}`, import.meta.url)))
    : originalFetch(url, ...rest);

function fixture() {
  const doc = createProject("Component report");
  doc.components = [
    {
      id: "anna",
      name: "Anna",
      aliases: ["Ann"],
      type: "character",
      quantity: 0,
    },
    { id: "lamp", name: "Lamp", type: "place", quantity: 2.5 },
    { id: "hidden", name: "Hidden", enabled: false, quantity: 9 },
  ];
  doc.props = [{ id: "old", name: "OLD PROPS ONLY", quantity: 99 }];
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { blockId: "scene", format: "scene" },
      content: [{ type: "text", text: "INT. ROOM — DAY" }],
    },
    {
      type: "paragraph",
      attrs: { blockId: "action", format: "action" },
      content: [{ type: "text", text: "Anna meets Ann beside the Lamp." }],
    },
  ];
  return doc;
}

test("quantity survives validation, TYT, library export/import and category changes, including zero", () => {
  const doc = fixture();
  const imported = readTYT(JSON.stringify(tytPayload(doc)));
  assert.deepEqual(
    imported.components.map((item) => item.quantity),
    [0, 2.5, 9],
  );
  const library = readComponentLibrary(
    JSON.stringify(libraryFromDocument(doc)),
  );
  const merged = mergeComponentLibrary(createProject("Target"), library, [
    "anna",
    "lamp",
  ]).document;
  assert.deepEqual(
    merged.components.map((item) => item.quantity),
    [0, 2.5],
  );
  imported.components[0].type = "place";
  assert.equal(validateImport(imported).components[0].quantity, 0);
  imported.components[0].quantity = "invalid";
  assert.equal(validateImport(imported).components[0].quantity, 1);
});

test("props report derives rows from enabled components and counts names and aliases", () => {
  const doc = fixture();
  const rows = componentReportRows(doc);
  assert.deepEqual(
    rows.map(({ name, quantity, mentions }) => ({ name, quantity, mentions })),
    [
      { name: "Anna", quantity: 0, mentions: 2 },
      { name: "Lamp", quantity: 2.5, mentions: 1 },
    ],
  );
  assert.deepEqual(rows[0].scenes, ["INT. ROOM — DAY"]);
  assert.equal(doc.components[0].quantity, 0);
});

test("PDF props report uses component quantities and never exports the old props list", async () => {
  const task = getDocument({
    data: new Uint8Array(await (await exportPropsPDF(fixture())).arrayBuffer()),
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  const items = (await (await pdf.getPage(1)).getTextContent()).items;
  const text = items.map((item) => item.str).join(" ");
  assert.match(text, /Anna/);
  assert.match(text, /Lamp/);
  assert.doesNotMatch(text, /OLD PROPS ONLY|Hidden/);
  assert.ok(items.some((item) => item.str === "0"));
  assert.ok(items.some((item) => item.str === "2.5"));
  await task.destroy();
});
