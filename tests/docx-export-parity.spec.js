import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { unzipSync, strFromU8 } from "fflate";
import { writeFile } from "node:fs/promises";

const block = (format, text, id, variant) => ({
  type: "paragraph",
  attrs: { format, blockId: id, ...(variant ? { sceneVariant: variant } : {}) },
  content: [{ type: "text", text }],
});
function fixture() {
  const doc = createProject("Сценарий для проверки экспорта Word");
  doc.metadata = {
    ...doc.metadata,
    author: "Автор сценария",
    email: "author@example.com",
    year: "2026",
  };
  doc.content.content = Array.from({ length: 12 }, (_, index) => {
    const letter = "ABCDEF"[index % 6];
    return [
      block(
        "scene",
        `ИНТ. СЦЕНА-${index + 1} ${index === 1 ? "С ДЛИННЫМ НАЗВАНИЕМ ПОМЕЩЕНИЯ ".repeat(6) : ""} — ДЕНЬ`,
        `scene-${index + 1}`,
        index ? letter : undefined,
      ),
      block(
        "action",
        "Анна открывает окно. Борис смотрит на улицу. Свет падает на стол.",
        `action-${index}`,
      ),
      block("character", "АННА", `character-${index}`),
      block(
        "speech",
        "Сегодня начинается новая история. Нам нужно разобраться во всём.",
        `speech-${index}`,
      ),
    ];
  }).flat();
  doc.sceneVariants = {
    "scene-12": { A: [block("scene", "НЕАКТИВНЫЙ ВАРИАНТ", "scene-12", "A")] },
  };
  doc.content.content[1].content[0].marks = [
    { type: "bold" },
    { type: "italic" },
    { type: "underline" },
  ];
  return doc;
}

test("Word exports the large poster and credits on a cover, with numbered active variants attached to scene headings", async ({
  page,
}, info) => {
  await page.goto("/free");
  const bytes = await page.evaluate(async (doc) => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#655185";
    ctx.fillRect(0, 0, 300, 400);
    ctx.fillStyle = "#ffffff";
    ctx.font = "22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ПОСТЕР", 150, 200);
    doc.metadata.poster = canvas.toDataURL("image/png");
    const { exportDOCX } = await import("/src/exports.js");
    return Array.from(
      new Uint8Array(await (await exportDOCX(doc)).arrayBuffer()),
    );
  }, fixture());
  await writeFile(info.outputPath("screenplay.docx"), Buffer.from(bytes));
  const archive = unzipSync(new Uint8Array(bytes));
  const xml = strFromU8(archive["word/document.xml"]);
  const result = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const attr = (node, key) => node?.getAttributeNS(ns, key);
    const scenes = [...doc.getElementsByTagNameNS(ns, "p")].filter(
      (p) => attr(p.getElementsByTagNameNS(ns, "pStyle")[0], "val") === "scene",
    );
    const extent = doc.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
      "extent",
    )[0];
    return {
      text: doc.documentElement.textContent,
      labels: scenes.map(
        (p) => p.getElementsByTagNameNS(ns, "t")[0].textContent,
      ),
      tabs: scenes.map((p) =>
        [...p.getElementsByTagNameNS(ns, "tab")]
          .filter((tab) => tab.hasAttributeNS(ns, "pos"))
          .map((tab) => [attr(tab, "val"), attr(tab, "pos")]),
      ),
      hanging: scenes.map((p) =>
        attr(p.getElementsByTagNameNS(ns, "ind")[0], "hanging"),
      ),
      keepNext: scenes.map(
        (p) => p.getElementsByTagNameNS(ns, "keepNext").length,
      ),
      size: [
        Number(extent.getAttribute("cx")) / 12700,
        Number(extent.getAttribute("cy")) / 12700,
      ],
      sections: [...doc.getElementsByTagNameNS(ns, "sectPr")].map((section) => {
        const size = section.getElementsByTagNameNS(ns, "pgSz")[0];
        return [Number(attr(size, "w")) / 20, Number(attr(size, "h")) / 20];
      }),
      emphasis: ["b", "i", "u"].map(
        (tag) => !!doc.getElementsByTagNameNS(ns, tag).length,
      ),
    };
  }, xml);
  expect(result.labels).toEqual(
    Array.from(
      { length: 12 },
      (_, index) => `${index + 1} ${"ABCDEF"[index % 6]}`,
    ),
  );
  expect(result.size).toEqual([540, 720]);
  expect(result.sections).toHaveLength(2);
  expect(result.sections[0][1]).toBeGreaterThan(792);
  expect(result.sections[1]).toEqual([612, 792]);
  for (const value of [
    "Сценарий для проверки экспорта Word",
    "Автор сценария",
    "author@example.com",
    "2026",
  ])
    expect(result.text).toContain(value);
  expect(result.text).not.toContain("НЕАКТИВНЫЙ ВАРИАНТ");
  expect(result.emphasis).toEqual([true, true, true]);
  expect(result.hanging).toEqual(Array(12).fill("720"));
  expect(result.keepNext).toEqual(Array(12).fill(1));
  for (const tabs of result.tabs)
    expect(tabs).toEqual([
      ["right", "-360"],
      ["left", "0"],
    ]);
});

test("Word without credits has no extra cover and still includes the scene number and default A variant", async ({
  page,
}, info) => {
  await page.goto("/free");
  const doc = createProject("Без титульного листа");
  doc.metadata = {
    ...doc.metadata,
    author: "",
    email: "",
    year: "",
    poster: null,
  };
  doc.content.content = [
    block("scene", "ИНТ. ДОМ — ДЕНЬ", "scene"),
    block("action", "Действие.", "action"),
  ];
  const bytes = await page.evaluate(async (doc) => {
    const { exportDOCX } = await import("/src/exports.js");
    return Array.from(
      new Uint8Array(await (await exportDOCX(doc)).arrayBuffer()),
    );
  }, doc);
  await writeFile(info.outputPath("no-cover.docx"), Buffer.from(bytes));
  const archive = unzipSync(new Uint8Array(bytes));
  const xml = strFromU8(archive["word/document.xml"]);
  expect(xml.match(/<w:sectPr[ >]/g)).toHaveLength(1);
  expect(xml).toContain("1 A");
  expect(xml).not.toContain("Без титульного листа");
});
