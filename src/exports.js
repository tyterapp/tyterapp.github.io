import { createProject, uid } from "./data.js";
import { textMatches, propOccurrences } from "./prop-matches.js";

export const hasTitlePage = (document) =>
  ["author", "email", "year", "poster"].some((key) =>
    String(document.metadata?.[key] || "").trim(),
  );
const posterData = (document) =>
  /^data:image\/(jpeg|png);base64,/.test(document.metadata?.poster || "")
    ? document.metadata.poster
    : null;
async function posterImage(document) {
  const data = posterData(document);
  if (!data) return null;
  const blob = await (await fetch(data)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(180 / bitmap.width, 240 / bitmap.height);
  const dimensions = {
    width: bitmap.width * scale,
    height: bitmap.height * scale,
  };
  bitmap.close();
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    type: blob.type === "image/png" ? "png" : "jpg",
    ...dimensions,
  };
}

const FORMAT = {
  scene: {
    fdx: "Scene Heading",
    left: 0,
    right: 0,
    upper: true,
    bold: true,
    keep: true,
    after: 12,
  },
  action: { fdx: "Action", left: 0, right: 0, after: 12 },
  character: {
    fdx: "Character",
    left: 158.4,
    right: 36,
    upper: true,
    keep: true,
    after: 0,
  },
  speech: { fdx: "Dialogue", left: 72, right: 108, after: 12 },
  parenthetical: {
    fdx: "Parenthetical",
    left: 115.2,
    right: 108,
    keep: true,
    after: 0,
  },
  transition: {
    fdx: "Transition",
    left: 0,
    right: 0,
    upper: true,
    align: "right",
    after: 12,
  },
  plain: { fdx: "General", left: 0, right: 0, after: 12 },
};
export function blockText(block) {
  return (block.content || [])
    .map((p) => (p.type === "hardBreak" ? "\n" : p.text || ""))
    .join("");
}
const xml = (value) =>
  String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[ch],
    );
const styledText = (block) => {
  const spec = FORMAT[block.attrs?.format] || FORMAT.action;
  const value = blockText(block);
  return spec.upper ? value.toLocaleUpperCase() : value;
};
const styledRuns = (block) => {
  const spec = FORMAT[block.attrs?.format] || FORMAT.action;
  return (block.content || []).map((part) => {
    const marks = new Set((part.marks || []).map((m) => m.type));
    const text = part.type === "hardBreak" ? "\n" : part.text || "";
    return {
      text: spec.upper ? text.toLocaleUpperCase() : text,
      bold: !!spec.bold || marks.has("bold"),
      italic: marks.has("italic"),
      underline: marks.has("underline"),
    };
  });
};
export function exportFDX(document) {
  const titlePage = hasTitlePage(document)
    ? `<TitlePage><Content>${Array.from({ length: 8 }, () => '<Paragraph Type="General"><Text></Text></Paragraph>').join("")}${[document.title, "Сценарий", document.metadata.author, document.metadata.year, document.metadata.email].map((text) => `<Paragraph Type="General" Alignment="Center"><Text Font="Courier Final Draft" Size="12">${xml(text)}</Text></Paragraph>`).join("")}</Content></TitlePage>`
    : "";
  const paragraphs = document.content.content
    .map((block) => {
      const spec = FORMAT[block.attrs?.format] || FORMAT.action;
      const text =
        styledRuns(block)
          .map((run) => {
            const style = [
              run.bold && "Bold",
              run.italic && "Italic",
              run.underline && "Underline",
            ]
              .filter(Boolean)
              .join("+");
            return `<Text${style ? ` Style="${style}"` : ""}>${xml(run.text)}</Text>`;
          })
          .join("") || "<Text></Text>";
      return `    <Paragraph Type="${spec.fdx}">${text}</Paragraph>`;
    })
    .join("\n");
  return new Blob(
    [
      `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<FinalDraft DocumentType="Script" Template="No" Version="3">\n  <Content>\n${paragraphs}\n  </Content>\n${titlePage}\n</FinalDraft>\n`,
    ],
    { type: "application/xml;charset=utf-8" },
  );
}
export function importFDX(text, title) {
  const parsed = new DOMParser().parseFromString(text, "application/xml");
  if (
    parsed.querySelector("parsererror") ||
    parsed.documentElement.tagName !== "FinalDraft"
  )
    throw new Error("Это не корректный файл Final Draft (.fdx).");
  const content = [...parsed.documentElement.children].find(
    (node) => node.tagName === "Content",
  );
  const paragraphs = content
    ? [...content.children].filter((node) => node.tagName === "Paragraph")
    : [];
  if (!paragraphs.length)
    throw new Error("В файле не найдены абзацы сценария.");
  if (paragraphs.length > 20000)
    throw new Error("В файле слишком много абзацев.");
  const formats = Object.fromEntries(
    Object.entries(FORMAT).map(([key, value]) => [value.fdx, key]),
  );
  const doc = createProject(title);
  doc.content.content = paragraphs.map((node) => {
    const children = [...node.getElementsByTagName("Text")].flatMap((part) => {
      const styles = (part.getAttribute("Style") || "")
        .toLowerCase()
        .split("+");
      const marks = ["bold", "italic", "underline"]
        .filter((type) => styles.includes(type))
        .map((type) => ({ type }));
      return part.textContent
        .split("\n")
        .flatMap((line, index) => [
          ...(index ? [{ type: "hardBreak" }] : []),
          ...(line
            ? [{ type: "text", text: line, ...(marks.length ? { marks } : {}) }]
            : []),
        ]);
    });
    return {
      type: "paragraph",
      attrs: {
        blockId: uid(),
        format: formats[node.getAttribute("Type")] || "plain",
      },
      ...(children.length ? { content: children } : {}),
    };
  });
  return doc;
}
export async function exportDOCX(document) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Footer,
    PageNumber,
    AlignmentType,
    LineRuleType,
    ImageRun,
  } = await import("docx");
  const image = hasTitlePage(document) ? await posterImage(document) : null;
  const titleParagraph = (text, options = {}) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240, ...options.spacing },
      children: [
        new TextRun({
          text,
          font: "Courier New",
          size: 24,
          bold: !!options.bold,
        }),
      ],
    });
  const cover = hasTitlePage(document)
    ? [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
            },
          },
          children: [
            titleParagraph(document.title, {
              bold: true,
              spacing: { before: 960 },
            }),
            ...(image
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 },
                    children: [
                      new ImageRun({
                        data: image.data,
                        type: image.type,
                        transformation: {
                          width: image.width,
                          height: image.height,
                        },
                        altText: {
                          title: "Обложка",
                          description: document.title,
                          name: "Обложка",
                        },
                      }),
                    ],
                  }),
                ]
              : []),
            titleParagraph("Сценарий"),
            titleParagraph(document.metadata.author),
            titleParagraph(document.metadata.year),
            titleParagraph(document.metadata.email),
          ],
        },
      ]
    : [];
  const paragraphs = document.content.content.map((block) => {
    const spec = FORMAT[block.attrs?.format] || FORMAT.action;
    return new Paragraph({
      style: block.attrs?.format || "action",
      alignment:
        spec.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
      indent: {
        left: Math.round(spec.left * 20),
        right: Math.round(spec.right * 20),
      },
      spacing: {
        after: spec.after * 20,
        before: 0,
        line: 240,
        lineRule: LineRuleType.EXACT,
      },
      keepNext: !!spec.keep,
      widowControl: true,
      children: styledRuns(block).flatMap((run) =>
        run.text.split("\n").map(
          (text, i) =>
            new TextRun({
              text,
              ...(i ? { break: 1 } : {}),
              bold: run.bold,
              italics: run.italic,
              ...(run.underline ? { underline: {} } : {}),
              font: "Courier New",
              size: 24,
            }),
        ),
      ),
    });
  });
  return Packer.toBlob(
    new Document({
      title: document.title,
      creator: document.metadata?.author || "Tyter",
      styles: {
        default: { document: { run: { font: "Courier New", size: 24 } } },
        paragraphStyles: Object.entries(FORMAT).map(([id, spec]) => ({
          id,
          name: spec.fdx,
          basedOn: "Normal",
          next: "action",
          quickFormat: true,
        })),
      },
      sections: [
        ...cover,
        {
          properties: {
            page: {
              pageNumbers: { start: 1 },
              size: { width: 12240, height: 15840 },
              margin: {
                top: 1440,
                bottom: 1440,
                left: 2160,
                right: 1440,
                footer: 720,
              },
            },
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      font: "Courier New",
                      size: 20,
                    }),
                  ],
                }),
              ],
            }),
          },
          children: paragraphs,
        },
      ],
    }),
  );
}
let fontPromise;
async function getFonts() {
  if (!fontPromise)
    fontPromise = Promise.all(
      ["Regular", "Bold", "Italic", "BoldItalic"].map(async (style) => {
        const response = await fetch(`/fonts/Cousine-${style}.ttf`);
        if (!response.ok)
          throw new Error("Не удалось загрузить шрифт для PDF.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return { style, base64: btoa(binary) };
      }),
    ).catch((error) => {
      fontPromise = null;
      throw error;
    });
  return fontPromise;
}
export async function exportPDF(document) {
  const [{ jsPDF }, fonts] = await Promise.all([import("jspdf"), getFonts()]);
  const pdf = new jsPDF({ unit: "pt", format: "letter", compress: true });
  for (const { style, base64 } of fonts) {
    pdf.addFileToVFS(`Cousine-${style}.ttf`, base64);
    pdf.addFont(
      `Cousine-${style}.ttf`,
      "Cousine",
      {
        Regular: "normal",
        Bold: "bold",
        Italic: "italic",
        BoldItalic: "bolditalic",
      }[style],
    );
  }
  pdf.setProperties({ title: document.title, creator: "Tyter" });
  pdf.setFont("Cousine", "normal");
  pdf.setFontSize(12);
  const titlePage = hasTitlePage(document);
  if (titlePage) {
    pdf.setFont("Cousine", "bold");
    const titleLines = pdf.splitTextToSize(document.title || "Сценарий", 432);
    pdf.text(titleLines, 306, 160, { align: "center" });
    let coverY = 180 + titleLines.length * 14;
    const poster = posterData(document);
    if (poster) {
      const image = pdf.getImageProperties(poster);
      const scale = Math.min(135 / image.width, 180 / image.height);
      pdf.addImage(
        poster,
        image.fileType,
        (612 - image.width * scale) / 2,
        coverY,
        image.width * scale,
        image.height * scale,
      );
      coverY += image.height * scale + 32;
    }
    pdf.setFont("Cousine", "normal");
    for (const text of [
      "Сценарий",
      document.metadata.author,
      document.metadata.year,
      document.metadata.email,
    ]) {
      if (!String(text || "").trim()) continue;
      const lines = pdf.splitTextToSize(String(text), 432);
      pdf.text(lines, 306, coverY, { align: "center" });
      coverY += lines.length * 14 + 14;
    }
    pdf.addPage();
  }
  let y = 72;
  const blocks = document.content.content.map((block) => {
    const spec = FORMAT[block.attrs?.format] || FORMAT.action;
    pdf.setFont("Cousine", spec.bold ? "bold" : "normal");
    const lines = pdf.splitTextToSize(
      styledText(block) || " ",
      432 - spec.left - spec.right,
    );
    let offset = 0;
    const runs = styledRuns(block).map((run) => {
      const from = offset;
      offset += run.text.length;
      return { ...run, from, to: offset };
    });
    return { spec, lines, runs, text: styledText(block) };
  });
  const newPage = () => {
    pdf.addPage();
    y = 72;
  };
  blocks.forEach(({ spec, lines, runs, text }, index) => {
    let reserve = Math.min(lines.length, 2) * 12;
    if (spec.keep) {
      reserve = lines.length * 12 + spec.after;
      for (let j = index + 1; j < blocks.length && j < index + 4; j++) {
        reserve += Math.min(blocks[j].lines.length, 2) * 12;
        if (!blocks[j].spec.keep) break;
      }
    }
    if (y > 72 && y + Math.min(reserve, 624) > 720) newPage();
    pdf.setFont("Cousine", spec.bold ? "bold" : "normal");
    pdf.setFontSize(12);
    let cursor = 0;
    lines.forEach((line) => {
      if (y + 12 > 720) newPage();
      const start = Math.max(cursor, text.indexOf(line, cursor)),
        end = start + line.length;
      cursor = end + (text[end] === "\n" ? 1 : 0);
      pdf.setFont("Cousine", spec.bold ? "bold" : "normal");
      const left =
        spec.align === "right" ? 540 - pdf.getTextWidth(line) : 108 + spec.left;
      for (const run of runs) {
        const from = Math.max(start, run.from),
          to = Math.min(end, run.to);
        if (to <= from) continue;
        const part = text.slice(from, to);
        const x = left + pdf.getTextWidth(line.slice(0, from - start));
        pdf.setFont(
          "Cousine",
          run.bold
            ? run.italic
              ? "bolditalic"
              : "bold"
            : run.italic
              ? "italic"
              : "normal",
        );
        pdf.text(part, x, y + 10);
        if (run.underline) {
          pdf.setLineWidth(0.5);
          pdf.line(x, y + 11.5, x + pdf.getTextWidth(part), y + 11.5);
        }
      }
      y += 12;
    });
    y += spec.after;
  });
  for (let i = titlePage ? 2 : 1; i <= pdf.getNumberOfPages(); i++) {
    pdf.setPage(i);
    pdf.setFont("Cousine", "normal");
    pdf.setFontSize(10);
    pdf.text(`${i - (titlePage ? 1 : 0)}.`, 540, 46, { align: "right" });
  }
  return pdf.output("blob");
}
export async function exportPropsPDF(document) {
  const [{ jsPDF }, fonts] = await Promise.all([import("jspdf"), getFonts()]);
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  for (const { style, base64 } of fonts) {
    pdf.addFileToVFS(`Cousine-${style}.ttf`, base64);
    pdf.addFont(
      `Cousine-${style}.ttf`,
      "Cousine",
      {
        Regular: "normal",
        Bold: "bold",
        Italic: "italic",
        BoldItalic: "bolditalic",
      }[style],
    );
  }
  pdf.setProperties({
    title: `${document.title} — реквизит`,
    creator: "Tyter",
  });
  const width = pdf.internal.pageSize.getWidth();
  let y = 48;
  pdf.setFont("Cousine", "bold");
  pdf.setFontSize(16);
  pdf.text("Реквизит", 40, y);
  y += 26;
  pdf.setFont("Cousine", "normal");
  pdf.setFontSize(10);
  const title = pdf.splitTextToSize(document.title || "Сценарий", width - 80);
  pdf.text(title, 40, y);
  y += title.length * 13 + 20;
  const heading = () => {
    pdf.setFillColor(244, 242, 248);
    pdf.rect(40, y - 12, width - 80, 25, "F");
    pdf.setFont("Cousine", "bold");
    pdf.text("Название", 48, y + 4);
    pdf.text("Кол-во", 310, y + 4);
    pdf.text("Упоминания", 400, y + 4);
    pdf.setFont("Cousine", "normal");
    y += 36;
  };
  const page = () => {
    pdf.addPage();
    y = 48;
    heading();
  };
  heading();
  for (const prop of document.props || []) {
    let scene = "Вне сцены";
    const scenes = new Set();
    for (const block of document.content.content) {
      if (block.attrs?.format === "scene") scene = blockText(block);
      if (textMatches(blockText(block), prop.name).length) scenes.add(scene);
    }
    const detail = [
      ...(prop.description ? [prop.description] : []),
      `Сцены: ${[...scenes].join("; ") || "нет упоминаний"}`,
    ].join("\n");
    const name = pdf.splitTextToSize(prop.name, 240),
      description = pdf.splitTextToSize(detail, width - 96);
    if (y + Math.min(120, (name.length + description.length) * 13 + 24) > 780)
      page();
    pdf.setFont("Cousine", "bold");
    pdf.text(name, 48, y);
    pdf.text(String(prop.quantity || 1), 310, y);
    pdf.text(String(propOccurrences(document.content, prop.name)), 400, y);
    pdf.setFont("Cousine", "normal");
    y += name.length * 13 + 6;
    for (const line of description) {
      if (y > 780) page();
      pdf.text(line, 48, y);
      y += 13;
    }
    y += 12;
    pdf.setDrawColor(228, 223, 235);
    pdf.line(40, y, width - 40, y);
    y += 22;
  }
  if (!document.props?.length) pdf.text("Реквизит пока не добавлен.", 48, y);
  for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
    pdf.setPage(i);
    pdf.setFontSize(9);
    pdf.text(String(i), width - 40, 815, { align: "right" });
  }
  return pdf.output("blob");
}
export function saveBlob(blob, title, extension) {
  const name = (title || "Сценарий")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .slice(0, 120);
  const url = URL.createObjectURL(blob),
    link = window.document.createElement("a");
  link.href = url;
  link.download = `${name}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
