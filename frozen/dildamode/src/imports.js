import { createProject, uid } from "./data.js";
import { importFDX } from "./exports.js";
import { readTYT } from "./tyt-format.js";

const paragraph = (format, content) => ({
  type: "paragraph",
  attrs: { format, blockId: uid() },
  ...(content.length ? { content } : {}),
});
const guessFormat = (text, previous = "action", indent = 0) => {
  if (/^(ИНТ\.|ЭКС\.|НАТ\.|INT\.|EXT\.)/i.test(text)) return "scene";
  if (/^\(.+\)$/.test(text)) return "parenthetical";
  if (/(:$|ЗАТЕМНЕНИЕ|FADE (OUT|IN)|CUT TO)/i.test(text)) return "transition";
  if (
    text.length < 55 &&
    /[\p{L}]/u.test(text) &&
    text === text.toLocaleUpperCase() &&
    !/[.!?]$/.test(text)
  )
    return "character";
  if (
    ["character", "parenthetical", "speech"].includes(previous) &&
    indent > 25
  )
    return "speech";
  return "action";
};

async function importDOCX(file, title) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (file) =>
      file.name === "word/document.xml" &&
      file.originalSize <= 20 * 1024 * 1024,
  });
  if (!zip["word/document.xml"])
    throw new Error("В DOCX не найден текст документа.");
  const xml = new DOMParser().parseFromString(
    strFromU8(zip["word/document.xml"]),
    "application/xml",
  );
  if (xml.querySelector("parsererror"))
    throw new Error("Не удалось прочитать DOCX.");
  const all = (node, name) => [...node.getElementsByTagNameNS("*", name)];
  const attr = (node, name) => node?.getAttribute(`w:${name}`) || "";
  const formats = {
    scene: "scene",
    sceneheading: "scene",
    action: "action",
    character: "character",
    dialogue: "speech",
    speech: "speech",
    parenthetical: "parenthetical",
    transition: "transition",
    plain: "plain",
    general: "plain",
  };
  let previous = "action";
  const blocks = all(xml, "p").map((node) => {
    const content = all(node, "r").flatMap((run) => {
      const marks = [
        ["b", "bold"],
        ["i", "italic"],
        ["u", "underline"],
      ]
        .filter(([tag]) => {
          const item = all(run, tag)[0];
          return item && !["0", "false", "none"].includes(attr(item, "val"));
        })
        .map(([, type]) => ({ type }));
      return [...run.children].flatMap((part) => {
        if (part.localName === "br" || part.localName === "cr")
          return [{ type: "hardBreak" }];
        const text =
          part.localName === "t"
            ? part.textContent
            : part.localName === "tab"
              ? " "
              : "";
        return text
          ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }]
          : [];
      });
    });
    const text = content.map((n) => n.text || "\n").join("");
    const style = attr(all(node, "pStyle")[0], "val")
      .replace(/[\s_-]/g, "")
      .toLocaleLowerCase();
    const indent = Number(attr(all(node, "ind")[0], "left")) / 20;
    const format = formats[style] || guessFormat(text, previous, indent);
    previous = format;
    return paragraph(format, content);
  });
  if (!blocks.some((block) => block.content?.length))
    throw new Error("DOCX не содержит текста.");
  if (blocks.length > 20000)
    throw new Error("В документе слишком много абзацев.");
  return { ...createProject(title), content: { type: "doc", content: blocks } };
}

async function importPDF(file, title) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } =
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  });
  let pdf;
  try {
    pdf = await task.promise;
    if (pdf.numPages > 1000)
      throw new Error("PDF слишком большой: максимум 1000 страниц.");
    const blocks = [];
    let previous = "action";
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { items } = await page.getTextContent();
      const lines = [];
      for (const item of items
        .filter((item) => typeof item.str === "string" && item.str.trim())
        .sort(
          (a, b) =>
            b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
        )) {
        const y = item.transform[5],
          x = item.transform[4];
        let line = lines.at(-1);
        if (!line || Math.abs(line.y - y) > 3) {
          line = {
            y,
            x,
            right: x,
            text: "",
            size: Math.max(1, Math.abs(item.transform[3])),
          };
          lines.push(line);
        }
        if (line.text && x - line.right > line.size * 0.2) line.text += " ";
        line.text += item.str;
        line.right = x + item.width;
      }
      const body = lines.filter(
        (line) =>
          !(
            /^\d+[.]?$/.test(line.text.trim()) &&
            (line.y > page.view[3] - 70 || line.y < 60)
          ),
      );
      const left = Math.min(...body.map((line) => line.x));
      let lastLine = null;
      for (const line of body) {
        const text = line.text.trim();
        if (!text) continue;
        const format = guessFormat(text, previous, line.x - left);
        const last = blocks.at(-1);
        if (
          lastLine &&
          last &&
          ["action", "speech"].includes(format) &&
          last.attrs.format === format &&
          Math.abs(lastLine.x - line.x) < 8 &&
          lastLine.y - line.y < line.size * 1.7
        ) {
          last.content[0].text += " " + text;
        } else blocks.push(paragraph(format, [{ type: "text", text }]));
        previous = format;
        lastLine = line;
      }
      page.cleanup();
    }
    if (!blocks.length)
      throw new Error(
        "В PDF нет текстового слоя. Для скана сначала выполните распознавание текста.",
      );
    return {
      ...createProject(title),
      content: { type: "doc", content: blocks },
    };
  } finally {
    await task.destroy();
  }
}

export async function importDocument(file) {
  const extension = file.name.split(".").at(-1).toLowerCase();
  const title = file.name.replace(/\.(fdx|docx|pdf|tyt)$/i, "");
  if (extension === "tyt") return readTYT(await file.text());
  if (extension === "fdx") return importFDX(await file.text(), title);
  if (extension === "docx") return importDOCX(file, title);
  if (extension === "pdf") return importPDF(file, title);
  throw new Error("Выберите файл FDX, DOCX или PDF.");
}
