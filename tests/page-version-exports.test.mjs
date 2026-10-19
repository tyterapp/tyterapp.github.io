import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { DOMMatrix, ImageData, Path2D, createCanvas } from "@napi-rs/canvas";
import { createProject } from "../src/data.js";
import { ensurePageColors } from "../src/page-colors.js";
import {
  ensurePageVersions,
  pageVersionSchema,
  pageVersionSlice,
} from "../src/page-versions.js";
import { exportPDF, exportDOCX, exportFDX } from "../src/exports.js";
import { scriptVersionExportStyle } from "../src/script-version-colors.js";

globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;
globalThis.Path2D = Path2D;
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) =>
  String(url).startsWith("/fonts/")
    ? new Response(await readFile(new URL(`../public${url}`, import.meta.url)))
    : originalFetch(url, ...rest);

const paragraph = (format, text, id) => ({
  type: "paragraph",
  attrs: { format, blockId: id },
  content: [{ type: "text", text }],
});
function fixture({ long = false, cover = false } = {}) {
  let document = createProject("Mixed selected page versions");
  document.metadata = {
    ...document.metadata,
    ...(cover ? { author: "Test author" } : {}),
  };
  document.content.content = [
    paragraph("scene", "ИНТ. ДОМ — ДЕНЬ", "scene-1"),
    paragraph(
      "action",
      long
        ? "START " + "One more line of dialogue. ".repeat(900) + " END"
        : "BLUE VISIBLE PAGE ONE",
      "action-1",
    ),
    paragraph("scene", "EXT. GARDEN — NIGHT", "scene-2"),
    paragraph("action", "PINK VISIBLE PAGE TWO", "action-2"),
  ];
  const node = pageVersionSchema.nodeFromJSON(document.content);
  const start = node.child(0).nodeSize + node.child(1).nodeSize;
  document = ensurePageVersions(document, [0, start]);
  document.pageVersions.pages.forEach((page, index) => {
    const old = pageVersionSlice(document, page.id, "white");
    old.slice.content = [
      paragraph("action", `DORMANT WHITE ${index}`, `dormant-${index}`),
    ];
    page.versions.white = old;
    page.active = index === 0 ? "blue" : "pink";
  });
  return ensurePageColors(document);
}
async function readPdf(document, capturePath) {
  const blob = await exportPDF(document);
  const task = getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index);
    const items = (await page.getTextContent()).items.filter((item) =>
      item.str?.trim(),
    );
    const viewport = page.getViewport({ scale: 1 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      canvas,
    }).promise;
    if (capturePath)
      await writeFile(
        `${capturePath}-${index}.png`,
        canvas.toBuffer("image/png"),
      );
    pages.push({
      items,
      text: items.map((item) => item.str).join(" "),
      background: Array.from(
        canvas.getContext("2d").getImageData(2, 2, 1, 1).data,
      ).slice(0, 3),
    });
  }
  await task.destroy();
  return pages;
}

test("PDF exports only selected page variants with matching backgrounds and aligned version/page headers", async () => {
  const pages = await readPdf(fixture(), process.env.TYTER_PAGE_EXPORT_QA);
  assert.equal(pages.length, 2);
  for (const [index, version] of ["blue", "pink"].entries()) {
    const page = pages[index],
      label = index ? "v3 Pink" : "v2 Blue";
    assert.ok(page.text.includes(label));
    assert.ok(
      page.text.includes(
        index ? "PINK VISIBLE PAGE TWO" : "BLUE VISIBLE PAGE ONE",
      ),
    );
    assert.ok(!page.text.includes("DORMANT"));
    const header = page.items.find(
      (item) =>
        item.str.includes(label.split(" ")[0]) && item.transform[5] > 740,
    );
    const number = page.items.find(
      (item) =>
        item.str === String(index + 1) &&
        Math.abs(item.transform[5] - header.transform[5]) < 0.1,
    );
    assert.ok(number, "page number shares version label baseline");
    assert.equal(number.fontName, header.fontName);
    assert.equal(number.height, header.height);
    assert.ok(header.transform[4] < number.transform[4]);
    const expected = scriptVersionExportStyle(version)
      .background.slice(1)
      .match(/../g)
      .map((pair) => parseInt(pair, 16));
    assert.deepEqual(page.background, expected);
  }
});

test("PDF keeps all overflowing lines in their selected version and leaves the cover unlabelled", async () => {
  const pages = await readPdf(fixture({ long: true, cover: true }));
  assert.ok(pages.length > 3);
  assert.ok(pages[0].text.includes("Test author"));
  assert.ok(!pages[0].text.includes("v2 Blue"));
  const blue = pages.slice(1, -1);
  assert.ok(
    blue.every(
      (page) => page.text.includes("v2 Blue") && !page.text.includes("v3 Pink"),
    ),
  );
  assert.ok(blue[0].text.includes("START"));
  assert.ok(blue.at(-1).text.includes("END"));
  const body = blue
    .flatMap((page) =>
      page.items
        .filter((item) => item.transform[5] < 740)
        .map((item) => item.str),
    )
    .join(" ")
    .replace(/\s+/g, " ");
  assert.equal((body.match(/One more line of dialogue\./g) || []).length, 900);
  assert.ok(pages.at(-1).text.includes("v3 Pink"));
  assert.ok(pages.at(-1).text.includes("PINK VISIBLE PAGE TWO"));
});

test("DOCX uses independent page sections, selected text and colored version headers in the page-number font", async () => {
  const blob = await exportDOCX(fixture());
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const xml = strFromU8(zip["word/document.xml"]);
  assert.ok(
    xml.includes("BLUE VISIBLE PAGE ONE") &&
      xml.includes("PINK VISIBLE PAGE TWO"),
  );
  assert.ok(!xml.includes("DORMANT"));
  assert.equal((xml.match(/<w:sectPr>/g) || []).length, 2);
  const headers = Object.keys(zip)
    .filter((path) => /^word\/header\d+\.xml$/.test(path))
    .map((path) => strFromU8(zip[path]));
  assert.equal(headers.length, 2);
  for (const [index, version] of ["blue", "pink"].entries()) {
    const header = headers[index],
      style = scriptVersionExportStyle(version);
    assert.ok(header.includes(index ? "v3 Pink" : "v2 Blue"));
    assert.ok(header.includes(`w:color w:val="${style.ink.slice(1)}"`));
    assert.ok(header.includes('w:val="right"'));
    assert.ok(header.includes('w:sz w:val="18"'));
    assert.ok(header.includes("PAGE"));
    assert.equal((header.match(/w:ascii="Courier New"/g) || []).length, 2);
  }
});

test("a page boundary inside a marked paragraph exports every character exactly once without a second scene number", async () => {
  let document = createProject("Split paragraph");
  const text = "ABCDEFGHIJKLMN0123456789OPQRSTUVWXYZ";
  document.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: "shared-scene" },
      content: [
        {
          type: "text",
          text,
          marks: [{ type: "italic" }, { type: "underline" }],
        },
      ],
    },
  ];
  document = ensurePageVersions(document, [0, 18]);
  document.pageVersions.pages[0].active = "blue";
  document.pageVersions.pages[1].active = "pink";
  const pages = await readPdf(document);
  assert.equal(pages.length, 2);
  const body = pages
    .flatMap((page) =>
      page.items.filter((item) => item.height > 9).map((item) => item.str),
    )
    .join("")
    .replace(/\s/g, "");
  assert.equal(body, text);
  assert.deepEqual(
    pages.map(
      (page) =>
        new Set(
          page.items
            .filter((item) => item.height === 9 && item.transform[5] < 740)
            .map((item) => item.transform[5]),
        ).size,
    ),
    [1, 0],
  );
  const zip = unzipSync(
    new Uint8Array(await (await exportDOCX(document)).arrayBuffer()),
  );
  const word = strFromU8(zip["word/document.xml"]);
  const wordText = [...word.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)]
    .map((match) => match[1])
    .join("")
    .replace(/^1 A/, "");
  assert.equal(wordText, text);
  assert.equal((word.match(/<w:i\/>/g) || []).length, 2);
  assert.equal((word.match(/<w:u /g) || []).length, 2);
  const fdx = await exportFDX(document).text();
  const content = fdx.slice(
    fdx.indexOf("<Content>"),
    fdx.indexOf("</Content>"),
  );
  const fdxText = [...content.matchAll(/<Text(?:\s[^>]*)?>(.*?)<\/Text>/g)]
    .map((match) => match[1])
    .join("");
  assert.equal(fdxText, text);
  assert.equal((content.match(/ Number=/g) || []).length, 1);
  assert.equal(
    (content.match(/Style="Bold\+Italic\+Underline"/g) || []).length,
    2,
  );
});

test("FDX keeps selected page breaks, native revision colors/names and a left revision field beside page number", async () => {
  const xml = await exportFDX(fixture()).text();
  assert.ok(
    xml.includes("BLUE VISIBLE PAGE ONE") &&
      xml.includes("PINK VISIBLE PAGE TWO"),
  );
  assert.ok(!xml.includes("DORMANT"));
  assert.equal((xml.match(/StartsNewPage="Yes"/g) || []).length, 1);
  assert.ok(xml.includes('HeaderFirstPage="Yes"'));
  assert.ok(
    xml.includes(
      'DynamicLabel Type="Last Revised" Font="Courier Final Draft" Size="9"',
    ),
  );
  assert.ok(
    xml.includes(
      'DynamicLabel Type="Page #" Font="Courier Final Draft" Size="9"',
    ),
  );
  for (const [id, version, label] of [
    [2, "blue", "v2 Blue"],
    [3, "pink", "v3 Pink"],
  ]) {
    const style = scriptVersionExportStyle(version);
    const color = `#${style.ink
      .slice(1)
      .match(/../g)
      .map((pair) => pair + pair)
      .join("")}`;
    assert.ok(
      xml.includes(`Revision ID="${id}" Name="${label}" Color="${color}"`),
    );
    assert.ok(xml.includes(`Text RevisionID="${id}"`));
  }
});

test("Open Arrow is embedded in PDF and Word, standalone arrows are centred and inline arrows retain surrounding text", async () => {
  let document = createProject("Open Arrow");
  document.content.content = [
    paragraph("action", "→", "arrow"),
    paragraph("action", "LEFT → RIGHT", "inline"),
  ];
  document = ensurePageVersions(document, [0]);
  const loading = getDocument({
    data: new Uint8Array(await (await exportPDF(document)).arrayBuffer()),
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  const page = await pdf.getPage(1),
    content = await page.getTextContent();
  const arrows = content.items.filter((item) => item.str === "→");
  assert.equal(arrows.length, 2);
  assert.ok(content.items.some((item) => item.str.includes("LEFT")));
  assert.ok(content.items.some((item) => item.str.includes("RIGHT")));
  // Use the document's real layout, independent of viewport or zoom.
  const { screenplayLayout } = await import("../src/document-layout.js");
  const layout = screenplayLayout(document.metadata.fontSize);
  const expectedCenter =
    (layout.left + (layout.width - layout.left - layout.right) / 2) * 0.75;
  assert.ok(
    Math.abs(arrows[0].transform[4] + arrows[0].width / 2 - expectedCenter) < 1,
  );
  assert.ok(
    content.styles[arrows[0].fontName].fontFamily.includes("OpenArrow") ||
      arrows[0].fontName !==
        content.items.find((item) => item.str.includes("LEFT")).fontName,
  );
  const viewport = page.getViewport({ scale: 1.2 }),
    canvas = createCanvas(viewport.width, viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport })
    .promise;
  await writeFile(
    new URL("../.cache/open-arrow-export.png", import.meta.url),
    canvas.toBuffer("image/png"),
  );
  await loading.destroy();
  const files = unzipSync(
    new Uint8Array(await (await exportDOCX(document)).arrayBuffer()),
  );
  const body = strFromU8(files["word/document.xml"]),
    fonts = strFromU8(files["word/fontTable.xml"]);
  assert.match(body, /w:ascii="Open Arrow"/);
  assert.match(body, /w:jc w:val="center"/);
  assert.match(fonts, /Open Arrow/);
  assert.match(fonts, /embedRegular/);
  assert.ok(files["word/fonts/font1.odttf"].length > 20000);
  const fdx = await exportFDX(document).text();
  assert.match(fdx, /Alignment="Center"[^>]*><Text[^>]*Font="Open Arrow"/);
  assert.match(fdx, /LEFT /);
  assert.match(fdx, /→/);
});
