import { componentReportRows } from "./component-report.js";
import { createProject, uid } from "./data.js";
import { screenplayLayout, screenplayBlockLayout } from "./document-layout.js";
import { documentFileStem } from "./local-file-names.js";
import { sceneLetter } from "./scene-variants.js";
import { isArrowOnly, splitArrowRun, wrapMeasuredText } from "./arrow-text.js";
import {
  SHOT_FIELDS,
  FORMAT_NAMES,
  shotScenes,
  shotReportName,
  shotText,
  durationLabel,
} from "./shot-info.js";
import { getLanguage, t } from "./i18n.js";
import {
  screenplayExportPages,
  continuesExportParagraph,
} from "./export-page-versions.js";
import {
  SCRIPT_VERSIONS,
  scriptVersionExportStyle,
} from "./script-version-colors.js";
import { croppedShotImage } from "./shot-image.js";

export const hasTitlePage = (document) =>
  ["author", "email", "year", "poster"].some((key) =>
    String(document.metadata?.[key] || "").trim(),
  );
const posterData = (document) =>
  /^data:image\/(jpeg|png);base64,/.test(document.metadata?.poster || "")
    ? document.metadata.poster
    : null;
const POSTER_MAX_PT = { width: 540, height: 720 };
async function posterImage(document) {
  const data = posterData(document);
  if (!data) return null;
  const blob = await (await fetch(data)).blob();
  const bitmap = await createImageBitmap(blob);
  // DOCX image dimensions use CSS pixels; PDF dimensions use points.
  const scale = Math.min(
    POSTER_MAX_PT.width / 0.75 / bitmap.width,
    POSTER_MAX_PT.height / 0.75 / bitmap.height,
  );
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
  return (block.content || [])
    .map((part) => {
      const marks = new Set((part.marks || []).map((m) => m.type));
      const text = part.type === "hardBreak" ? "\n" : part.text || "";
      return {
        text: spec.upper ? text.toLocaleUpperCase() : text,
        bold: !!spec.bold || marks.has("bold"),
        italic: marks.has("italic"),
        underline: marks.has("underline"),
      };
    })
    .flatMap(splitArrowRun);
};
const exportSceneLabel = (document, block, number) =>
  [
    document.settings?.exportSceneNumbers !== false ? number : null,
    document.settings?.exportSceneVariants !== false
      ? sceneLetter(block)
      : null,
  ]
    .filter((value) => value !== null)
    .join(" ");

function drawPdfVersionIcon(pdf, style, x, y, size = 10) {
  pdf.setFillColor(style.color);
  pdf.setDrawColor(style.ink);
  pdf.setLineWidth(0.45);
  const middle = size / 2;
  if (style.shape === "circle" || style.shape === "ellipse") {
    pdf.ellipse(
      x + middle,
      y + middle,
      middle * 0.8,
      middle * (style.shape === "circle" ? 0.8 : 0.55),
      "FD",
    );
    return;
  }
  const polygon = (count, start = -Math.PI / 2) =>
    Array.from({ length: count }, (_, index) => {
      const angle = start + (index * Math.PI * 2) / count;
      return [
        middle + Math.cos(angle) * middle * 0.9,
        middle + Math.sin(angle) * middle * 0.9,
      ];
    });
  const points =
    style.shape === "cross"
      ? [
          [3, 0],
          [7, 0],
          [7, 3],
          [10, 3],
          [10, 7],
          [7, 7],
          [7, 10],
          [3, 10],
          [3, 7],
          [0, 7],
          [0, 3],
          [3, 3],
        ].map(([a, b]) => [(a / 10) * size, (b / 10) * size])
      : style.shape === "star"
        ? polygon(10).map(([a, b], index) =>
            index % 2
              ? [middle + (a - middle) * 0.45, middle + (b - middle) * 0.45]
              : [a, b],
          )
        : polygon(
            { triangle: 3, diamond: 4, hexagon: 6, pentagon: 5, octagon: 8 }[
              style.shape
            ] || 4,
          );
  pdf.lines(
    points
      .slice(1)
      .map((point, index) => [
        point[0] - points[index][0],
        point[1] - points[index][1],
      ]),
    x + points[0][0],
    y + points[0][1],
    [1, 1],
    "FD",
    true,
  );
}
export function exportFDX(document) {
  const layout = screenplayLayout(document.metadata?.fontSize);
  const plan = screenplayExportPages(document);
  const titlePage = hasTitlePage(document)
    ? `<TitlePage><HeaderAndFooter HeaderVisible="No" FooterVisible="No"/><Content>${Array.from({ length: 8 }, () => '<Paragraph Type="General"><Text></Text></Paragraph>').join("")}${[document.title, "Сценарий", document.metadata.author, document.metadata.year, document.metadata.email].map((text) => `<Paragraph Type="General" Alignment="Center"><Text Font="Courier Final Draft" Size="12">${xml(text)}</Text></Paragraph>`).join("")}</Content></TitlePage>`
    : "";
  let sceneNumber = 0;
  const paragraphs = plan.pages
    .flatMap((page, pageIndex) =>
      page.content.content.map((block, blockIndex, blocks) => {
        const spec = FORMAT[block.attrs?.format] || FORMAT.action;
        const geometry = screenplayBlockLayout(
          block.attrs?.format || "action",
          blocks[blockIndex + 1]?.attrs?.format,
        );
        const previous = blocks[blockIndex - 1];
        const previousGeometry = previous
          ? screenplayBlockLayout(
              previous.attrs?.format || "action",
              block.attrs?.format,
            )
          : null;
        const contentWidth = (layout.width - layout.left - layout.right) * 0.75;
        const left = layout.left * 0.75 + contentWidth * geometry.left;
        const right = left + contentWidth * geometry.width;
        const spaceBefore = previousGeometry
          ? Math.max(previousGeometry.after, geometry.before) * 0.75
          : 0;
        const continuation =
          blockIndex === 0 &&
          continuesExportParagraph(page, plan.pages[pageIndex - 1]);
        const label =
          block.attrs?.format === "scene" && !continuation
            ? exportSceneLabel(document, block, ++sceneNumber)
            : "";
        const revision =
          SCRIPT_VERSIONS.findIndex(
            (version) => version.id === page.versionId,
          ) + 1;
        const text =
          styledRuns(block)
            .map((run) => {
              const style = [
                !run.arrow && run.bold && "Bold",
                !run.arrow && run.italic && "Italic",
                run.underline && "Underline",
              ]
                .filter(Boolean)
                .join("+");
              return `<Text RevisionID="${revision}" Color="#000000000000" Font="${run.arrow ? "Open Arrow" : "Courier Final Draft"}" Size="${layout.fontSize}"${style ? ` Style="${style}"` : ""}>${xml(run.text)}</Text>`;
            })
            .join("") || `<Text RevisionID="${revision}"></Text>`;
        return `    <Paragraph Type="${spec.fdx}" Alignment="${isArrowOnly(blockText(block)) ? "Center" : spec.align === "right" ? "Right" : "Left"}" FirstIndent="0.00" LeftIndent="${(left / 72).toFixed(4)}" RightIndent="${(right / 72).toFixed(4)}" SpaceBefore="${spaceBefore}" Spacing="1"${label ? ` Number="${xml(label)}"` : ""}${pageIndex > 0 && blockIndex === 0 ? ' StartsNewPage="Yes"' : ""}>${text}</Paragraph>`;
      }),
    )
    .join("\n");
  // Final Draft's native per-page revision field follows RevisionID in the
  // selected page, without inserting version labels into the screenplay text.
  const fdxColor = (color) =>
    `#${color
      .replace(/^#/, "")
      .match(/../g)
      .map((pair) => pair + pair)
      .join("")
      .toUpperCase()}`;
  const revisions = `<Revisions ActiveSet="1" Location="${((layout.width * 0.75) / 72 - 0.5).toFixed(2)}" RevisionMode="No" RevisionsShown="All" ShowAllMarks="No" ShowAllSets="Yes" ShowPageColor="Yes">${SCRIPT_VERSIONS.map(
    (version, index) => {
      const style = scriptVersionExportStyle(version.id);
      return `<Revision ID="${index + 1}" Name="${xml(version.label)}" Color="${fdxColor(style.ink)}" PageColor="${fdxColor(style.background)}" FullRevision="Yes" Mark="" Style=""/>`;
    },
  ).join("")}</Revisions>`;
  const header = `<HeaderAndFooter FooterVisible="No" HeaderFirstPage="Yes" HeaderVisible="Yes" StartingPage="1"><Header><Paragraph Alignment="Left" LeftIndent="0.50" RightIndent="-0.50" SpaceBefore="0" Spacing="1"><DynamicLabel Type="Last Revised" Font="Courier Final Draft" Size="9"/><Text Font="Courier Final Draft" Size="9">&#9;</Text><DynamicLabel Type="Page #" Font="Courier Final Draft" Size="9"/><Tabstops><Tabstop Position="${((layout.width * 0.75) / 72 - 1).toFixed(2)}" Type="Right"/></Tabstops></Paragraph></Header><Footer/></HeaderAndFooter>`;
  const pageLayout = `<PageLayout BackgroundColor="#FFFFFFFFFFFF" ForegroundColor="#000000000000" TopMargin="${layout.top * 0.75}" BottomMargin="${layout.bottom * 0.75}" HeaderMargin="24" FooterMargin="36" DocumentLeading="Normal"><PageSize Width="${((layout.width * 0.75) / 72).toFixed(4)}" Height="${((layout.height * 0.75) / 72).toFixed(4)}"/></PageLayout>`;
  return new Blob(
    [
      `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<FinalDraft DocumentType="Script" Template="No" Version="3">\n  <Content>\n${paragraphs}\n  </Content>\n${header}\n${pageLayout}\n${revisions}\n${titlePage}\n</FinalDraft>\n`,
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
async function openArrowFontData() {
  const response = await fetch("/dildamode/fonts/OpenArrow-Regular.ttf");
  if (!response.ok) throw new Error("Не удалось загрузить шрифт стрелок.");
  return new Uint8Array(await response.arrayBuffer());
}
export async function exportDOCX(document) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Footer,
    Header,
    PageNumber,
    AlignmentType,
    LineRuleType,
    ImageRun,
    TabStopType,
    Tab,
    SectionType,
  } = await import("docx");
  const plan = screenplayExportPages(document);
  const layout = screenplayLayout(document.metadata?.fontSize);
  const contentWidth = (layout.width - layout.left - layout.right) * 0.75;
  const image = hasTitlePage(document) ? await posterImage(document) : null;
  const titleParagraph = (text, options = {}) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: options.keepNext ?? true,
      spacing: {
        after: 280,
        line: 280,
        lineRule: LineRuleType.EXACT,
        ...options.spacing,
      },
      children: [
        new TextRun({
          text,
          font: "Courier New",
          size: 24,
          bold: !!options.bold,
        }),
      ],
    });
  const credits = [
    "Сценарий",
    document.metadata?.author,
    document.metadata?.year,
    document.metadata?.email,
  ]
    .filter((text) => String(text || "").trim())
    .map(String);
  const coverWidth = screenplayLayout().width * 0.75;
  const coverLineCount = (text) =>
    String(text)
      .split("\n")
      .reduce(
        (sum, line) =>
          sum +
          Math.max(
            1,
            Math.ceil(line.length / Math.floor((coverWidth - 144) / 7.2)),
          ) +
          1,
        0,
      );
  const coverHeight = Math.max(
    792,
    144 +
      coverLineCount(document.title || "Сценарий") * 14 +
      36 +
      (image ? image.height * 0.75 + 14 + 32 : 0) +
      credits.reduce((sum, text) => sum + coverLineCount(text) * 14 + 14, 0) +
      72,
  );
  const cover = hasTitlePage(document)
    ? [
        {
          properties: {
            page: {
              size: {
                width: Math.round(coverWidth * 20),
                height: Math.ceil(coverHeight * 20),
              },
              margin: { top: 2880, bottom: 1440, left: 1440, right: 1440 },
            },
          },
          children: [
            titleParagraph(document.title || "Сценарий", {
              bold: true,
              spacing: { after: 720 },
            }),
            ...(image
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    keepNext: true,
                    spacing: {
                      after: 640,
                    },
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
            ...credits.map((text, index) =>
              titleParagraph(text, { keepNext: index < credits.length - 1 }),
            ),
          ],
        },
      ]
    : [];
  let sceneNumber = 0;
  const paragraphsForPage = (page, pageIndex) =>
    page.content.content.map((block, index, blocks) => {
      const isScene = block.attrs?.format === "scene";
      const continuation =
        index === 0 &&
        continuesExportParagraph(page, plan.pages[pageIndex - 1]);
      const label =
        isScene && !continuation
          ? exportSceneLabel(document, block, ++sceneNumber)
          : "";
      const spec = FORMAT[block.attrs?.format] || FORMAT.action;
      const nextBlock = blocks[index + 1];
      const nextFormat = nextBlock && (nextBlock.attrs?.format || "action");
      const geometry = screenplayBlockLayout(
        block.attrs?.format || "action",
        nextFormat,
      );
      const previousFormat = blocks[index - 1]?.attrs?.format || "action";
      const previousGeometry = screenplayBlockLayout(
        previousFormat,
        block.attrs?.format || "action",
      );
      return new Paragraph({
        style: block.attrs?.format || "action",
        alignment: isArrowOnly(blockText(block))
          ? AlignmentType.CENTER
          : spec.align === "right"
            ? AlignmentType.RIGHT
            : AlignmentType.LEFT,
        indent: {
          left: Math.round(
            (plan.explicit ? contentWidth * geometry.left : spec.left) * 20,
          ),
          right: Math.round(
            (plan.explicit
              ? contentWidth * Math.max(0, 1 - geometry.left - geometry.width)
              : spec.right) * 20,
          ),
          ...(label ? { hanging: 720 } : {}),
        },
        ...(label
          ? {
              tabStops: [
                { type: TabStopType.RIGHT, position: -360 },
                { type: TabStopType.LEFT, position: 0 },
              ],
            }
          : {}),
        spacing: {
          after: plan.explicit
            ? 0
            : ["scene", "action"].includes(block.attrs?.format || "action")
              ? screenplayBlockLayout(
                  block.attrs?.format || "action",
                  nextFormat,
                ).after * 15
              : spec.after * 20,
          before:
            plan.explicit && index > 0
              ? Math.max(previousGeometry.after, geometry.before) * 15
              : 0,
          line: plan.explicit ? layout.fontSize * layout.lineHeight * 20 : 240,
          lineRule: LineRuleType.EXACT,
        },
        keepNext: !!spec.keep && index < blocks.length - 1,
        keepLines: true,
        widowControl: true,
        children: [
          ...(label
            ? [
                new TextRun({
                  children: [new Tab(), label, new Tab()],
                  font: "Courier New",
                  size: 18,
                  position: 3,
                  bold: false,
                }),
              ]
            : []),
          ...styledRuns(block).flatMap((run) =>
            run.text.split("\n").map(
              (text, i) =>
                new TextRun({
                  text,
                  ...(i ? { break: 1 } : {}),
                  bold: run.arrow ? false : run.bold,
                  italics: run.arrow ? false : run.italic,
                  ...(run.underline ? { underline: {} } : {}),
                  font: run.arrow ? "Open Arrow" : "Courier New",
                  size: plan.explicit ? layout.fontSize * 2 : 24,
                }),
            ),
          ),
        ],
      });
    });
  const pageHeader = (page) => {
    const style = scriptVersionExportStyle(page.versionId);
    const version =
      SCRIPT_VERSIONS.find((entry) => entry.id === page.versionId) ||
      SCRIPT_VERSIONS[0];
    const sheetWidth = plan.explicit ? layout.width * 0.75 : 612;
    const left = plan.explicit ? layout.left * 0.75 : 108;
    return new Header({
      children: [
        new Paragraph({
          indent: { left: Math.round((36 - left) * 20) },
          spacing: {
            after: 0,
            before: 0,
            line: 180,
            lineRule: LineRuleType.EXACT,
          },
          tabStops: [
            {
              type: TabStopType.RIGHT,
              position: Math.round((sheetWidth - 36 - left) * 20),
            },
          ],
          children: [
            new TextRun({
              text: `${page.versionId === "white" ? "○" : style.symbol} `,
              color: (page.versionId === "white"
                ? style.ink
                : style.color
              ).replace(/^#/, ""),
              font: "Segoe UI Symbol",
              size: 18,
            }),
            new TextRun({
              text: version.label,
              color: style.ink.replace(/^#/, ""),
              font: "Courier New",
              size: 18,
            }),
            new TextRun({
              children: [new Tab(), PageNumber.CURRENT],
              font: "Courier New",
              size: 18,
            }),
          ],
        }),
      ],
    });
  };
  return Packer.toBlob(
    new Document({
      title: document.title,
      creator: document.metadata?.author || "Tyter",
      fonts: plan.pages.some((page) =>
        page.content.content.some((block) =>
          /[\u2190-\u21ff]/u.test(blockText(block)),
        ),
      )
        ? [{ name: "Open Arrow", data: await openArrowFontData() }]
        : [],
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
        ...plan.pages.map((page, pageIndex) => ({
          properties: {
            type: SectionType.NEXT_PAGE,
            page: {
              ...(pageIndex === 0 ? { pageNumbers: { start: 1 } } : {}),
              size: plan.explicit
                ? {
                    width: Math.round(layout.width * 15),
                    height: Math.round(layout.height * 15),
                  }
                : { width: 12240, height: 15840 },
              margin: {
                top: plan.explicit ? layout.top * 15 : 1440,
                bottom: plan.explicit ? layout.bottom * 15 : 1440,
                left: plan.explicit ? layout.left * 15 : 2160,
                right: plan.explicit ? layout.right * 15 : 1440,
                header: 540,
                footer: 720,
              },
            },
          },
          headers: { default: pageHeader(page) },
          footers: {
            default: new Footer({
              children: [],
            }),
          },
          children: paragraphsForPage(page, pageIndex),
        })),
      ],
    }),
  );
}
const fontPromises = new Map();
export async function getFonts(screenplay = false) {
  if (!fontPromises.has(screenplay)) {
    const files = screenplay
      ? {
          Regular: "couriercyrillic.ttf",
          Bold: "cour_bold.ttf",
          Italic: "cour_italic.ttf",
          BoldItalic: "cour_bold_italic.ttf",
          Fallback: "cour.ttf",
          Arrow: "OpenArrow-Regular.ttf",
        }
      : Object.fromEntries(
          ["Regular", "Bold", "Italic", "BoldItalic"].map((style) => [
            style,
            `Cousine-${style}.ttf`,
          ]),
        );
    fontPromises.set(
      screenplay,
      Promise.all(
        Object.entries(files).map(async ([style, file]) => {
          const response = await fetch(`/dildamode/fonts/${file}`);
          if (!response.ok)
            throw new Error("Не удалось загрузить шрифт для PDF.");
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          return { style, base64: btoa(binary) };
        }),
      ).catch((error) => {
        fontPromises.delete(screenplay);
        throw error;
      }),
    );
  }
  return fontPromises.get(screenplay);
}
export async function exportPDF(document) {
  const [{ jsPDF }, fonts] = await Promise.all([
    import("jspdf"),
    getFonts(true),
  ]);
  const layout = screenplayLayout(document.metadata?.fontSize);
  // A CSS pixel is 3/4 of a PDF point. Export uses the full sheet, regardless of viewport.
  const pt = (pixels) => pixels * 0.75;
  const width = pt(layout.width),
    height = pt(layout.height);
  const leftMargin = pt(layout.left),
    rightEdge = width - pt(layout.right);
  const topMargin = pt(layout.top),
    bottomEdge = height - pt(layout.bottom);
  const contentWidth = rightEdge - leftMargin;
  const fontSize = layout.fontSize,
    lineHeight = fontSize * layout.lineHeight;
  const pdf = new jsPDF({
    unit: "pt",
    format: [width, height],
    compress: true,
  });
  for (const { style, base64 } of fonts) {
    pdf.addFileToVFS(`Courier-${style}.ttf`, base64);
    pdf.addFont(
      `Courier-${style}.ttf`,
      style === "Arrow"
        ? "ScreenplayArrow"
        : style === "Fallback"
          ? "ScreenplayFallback"
          : "ScreenplayCourier",
      {
        Regular: "normal",
        Bold: "bold",
        Italic: "italic",
        BoldItalic: "bolditalic",
        Fallback: "normal",
        Arrow: "normal",
      }[style],
    );
  }
  pdf.setProperties({ title: document.title, creator: "Tyter" });
  pdf.setFont("ScreenplayCourier", "normal");
  pdf.setFontSize(12);
  const titlePage = hasTitlePage(document);
  if (titlePage) {
    pdf.setFont("ScreenplayCourier", "bold");
    const titleLines = pdf.splitTextToSize(
      document.title || "Сценарий",
      contentWidth,
    );
    let coverY = 180 + titleLines.length * 14;
    const poster = posterData(document);
    const image = poster ? pdf.getImageProperties(poster) : null;
    const scale = image
      ? Math.min(
          POSTER_MAX_PT.width / image.width,
          POSTER_MAX_PT.height / image.height,
        )
      : 0;
    const credits = [
      "Сценарий",
      document.metadata.author,
      document.metadata.year,
      document.metadata.email,
    ]
      .filter((text) => String(text || "").trim())
      .map((text) => pdf.splitTextToSize(String(text), contentWidth));
    const creditsHeight = credits.reduce(
      (sum, lines) => sum + lines.length * 14 + 14,
      0,
    );
    const coverHeight = Math.max(
      height,
      coverY +
        (image ? image.height * scale + 32 : 0) +
        creditsHeight +
        topMargin,
    );
    // Keep the larger poster and all credits on one cover; screenplay pages keep their size.
    if (coverHeight > height) {
      pdf.addPage([width, coverHeight]);
      pdf.deletePage(1);
    }
    pdf.text(titleLines, width / 2, 160, { align: "center" });
    if (poster) {
      pdf.addImage(
        poster,
        image.fileType,
        (width - image.width * scale) / 2,
        coverY,
        image.width * scale,
        image.height * scale,
      );
      coverY += image.height * scale + 32;
    }
    pdf.setFont("ScreenplayCourier", "normal");
    for (const lines of credits) {
      pdf.text(lines, width / 2, coverY, { align: "center" });
      coverY += lines.length * 14 + 14;
    }
    pdf.addPage([width, height]);
  }
  pdf.setFontSize(fontSize);
  const plan = screenplayExportPages(document);
  let y = topMargin,
    previousAfter = 0,
    sceneNumber = 0,
    printedPage = 0,
    activePage = plan.pages[0];
  const decoratePage = () => {
    const style = scriptVersionExportStyle(activePage.versionId);
    const version =
      SCRIPT_VERSIONS.find((entry) => entry.id === activePage.versionId) ||
      SCRIPT_VERSIONS[0];
    // Fractions as strings avoid jsPDF rounding subtle light page colours to
    // two decimal places before a PDF viewer converts them back to sRGB.
    pdf.setFillColor(
      ...style.background
        .slice(1)
        .match(/../g)
        .map((pair) => (parseInt(pair, 16) / 255).toFixed(5)),
    );
    pdf.rect(0, 0, width, height, "F");
    pdf.setFont("ScreenplayCourier", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(style.ink);
    drawPdfVersionIcon(pdf, style, 36, 24, 10);
    pdf.text(version.label, 51, 32);
    pdf.setTextColor(0);
    pdf.setDrawColor(0);
    pdf.text(String(++printedPage), width - 36, 32, { align: "right" });
    pdf.setFontSize(fontSize);
  };
  const newPage = () => {
    pdf.addPage([width, height]);
    y = topMargin;
    previousAfter = 0;
    decoratePage();
  };
  decoratePage();
  plan.pages.forEach((page, pageIndex) => {
    activePage = page;
    if (pageIndex > 0) newPage();
    page.content.content.forEach((block, index, blocks) => {
      const format = block.attrs?.format || "action";
      const continuation =
        index === 0 &&
        continuesExportParagraph(page, plan.pages[pageIndex - 1]);
      const number = format === "scene" && !continuation ? ++sceneNumber : null;
      const label =
        number !== null ? exportSceneLabel(document, block, number) : "";
      const spec = FORMAT[format] || FORMAT.action;
      const nextBlock = blocks[index + 1];
      const nextFormat = nextBlock && (nextBlock.attrs?.format || "action");
      const geometry = screenplayBlockLayout(format, nextFormat);
      const font = spec.bold ? "bold" : "normal";
      const text = styledText(block);
      pdf.setFont("ScreenplayCourier", "normal");
      const glyphs = pdf.getFont().metadata.cmap.unicode.codeMap;
      const family =
        !spec.bold &&
        [...text].some(
          (char) =>
            char.codePointAt(0) > 32 &&
            !/[\u2190-\u21ff]/u.test(char) &&
            !glyphs[char.codePointAt(0)],
        )
          ? "ScreenplayFallback"
          : "ScreenplayCourier";
      pdf.setFont(family, font);
      let offset = 0;
      const runs = styledRuns(block).map((run) => {
        const from = offset;
        offset += run.text.length;
        return { ...run, from, to: offset };
      });
      const runFont = (run) =>
        run.arrow
          ? ["ScreenplayArrow", "normal"]
          : [
              run.bold || run.italic ? "ScreenplayCourier" : family,
              run.bold
                ? run.italic
                  ? "bolditalic"
                  : "bold"
                : run.italic
                  ? "italic"
                  : "normal",
            ];
      const measuredWidth = (start, end) =>
        runs.reduce((width, run) => {
          const from = Math.max(start, run.from),
            to = Math.min(end, run.to);
          if (to <= from) return width;
          pdf.setFont(...runFont(run));
          return width + pdf.getTextWidth(text.slice(from, to));
        }, 0);
      pdf.setFont(family, font);
      const lines = runs.some((run) => run.arrow)
        ? wrapMeasuredText(text, contentWidth * geometry.width, measuredWidth)
        : pdf.splitTextToSize(text || " ", contentWidth * geometry.width);
      pdf.setFont(family, font);
      // Adjacent paragraph margins collapse in the editor.
      const gap = index ? pt(Math.max(previousAfter, geometry.before)) : 0;
      const blockHeight = lines.length * lineHeight;
      if (
        y + gap + blockHeight > bottomEdge &&
        blockHeight <= bottomEdge - topMargin
      )
        newPage();
      else y += gap;
      const metrics = pdf.getFont().metadata;
      const ascent = metrics.hhea.ascender / metrics.head.unitsPerEm;
      const descent = metrics.hhea.decender / metrics.head.unitsPerEm;
      const baseline =
        (lineHeight - (ascent - descent) * fontSize) / 2 + ascent * fontSize;
      let cursor = 0;
      for (const [lineIndex, line] of lines.entries()) {
        if (y + lineHeight > bottomEdge) newPage();
        if (label && lineIndex === 0) {
          pdf.setFont("ScreenplayCourier", "normal");
          pdf.setFontSize(9);
          pdf.text(label, leftMargin - 18, y + baseline - (fontSize - 9) / 2, {
            align: "right",
          });
          pdf.setFontSize(fontSize);
        }
        const start = Math.max(cursor, text.indexOf(line, cursor));
        const end = start + line.length;
        cursor = end + (text[end] === "\n" ? 1 : 0);
        pdf.setFont(family, font);
        const left = isArrowOnly(text)
          ? leftMargin +
            contentWidth * geometry.left +
            (contentWidth * geometry.width - measuredWidth(start, end)) / 2
          : spec.align === "right"
            ? rightEdge - measuredWidth(start, end)
            : leftMargin + contentWidth * geometry.left;
        for (const run of runs) {
          const from = Math.max(start, run.from),
            to = Math.min(end, run.to);
          if (to <= from) continue;
          const part = text.slice(from, to);
          pdf.setFont(family, font);
          const x = left + measuredWidth(start, from);
          pdf.setFont(...runFont(run));
          const metrics = pdf.getFont().metadata;
          const arrowBaseline =
            (lineHeight -
              ((metrics.hhea.ascender - metrics.hhea.decender) /
                metrics.head.unitsPerEm) *
                fontSize) /
              2 +
            (metrics.hhea.ascender / metrics.head.unitsPerEm) * fontSize;
          pdf.text(part, x, y + (run.arrow ? arrowBaseline : baseline));
          if (run.underline) {
            pdf.setLineWidth(0.5);
            pdf.line(
              x,
              y + baseline + 1.5,
              x + pdf.getTextWidth(part),
              y + baseline + 1.5,
            );
          }
        }
        y += lineHeight;
      }
      previousAfter = geometry.after;
    });
  });
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
    title: t("{0} — реквизит", document.title),
    creator: "Tyter",
  });
  const width = pdf.internal.pageSize.getWidth();
  let y = 48;
  pdf.setFont("Cousine", "bold");
  pdf.setFontSize(16);
  pdf.text(t("Реквизит"), 40, y);
  y += 26;
  pdf.setFont("Cousine", "normal");
  pdf.setFontSize(10);
  const title = pdf.splitTextToSize(
    document.title || t("Сценарий"),
    width - 80,
  );
  pdf.text(title, 40, y);
  y += title.length * 13 + 20;
  const heading = () => {
    pdf.setFillColor(244, 242, 248);
    pdf.rect(40, y - 12, width - 80, 25, "F");
    pdf.setFont("Cousine", "bold");
    pdf.text(t("Название"), 48, y + 4);
    pdf.text(t("Кол-во"), 310, y + 4);
    pdf.text(t("Упоминания"), 400, y + 4);
    pdf.setFont("Cousine", "normal");
    y += 36;
  };
  const page = () => {
    pdf.addPage();
    y = 48;
    heading();
  };
  heading();
  const rows = componentReportRows(document);
  for (const prop of rows) {
    const detail = [
      ...(prop.description ? [prop.description] : []),
      t(
        "Сцены: {0}",
        prop.scenes.map((scene) => scene || t("Вне сцены")).join("; ") ||
          t("нет упоминаний"),
      ),
    ].join("\n");
    const name = pdf.splitTextToSize(prop.name, 240),
      description = pdf.splitTextToSize(detail, width - 96);
    if (y + Math.min(120, (name.length + description.length) * 13 + 24) > 780)
      page();
    pdf.setFont("Cousine", "bold");
    pdf.text(name, 48, y);
    pdf.text(String(prop.quantity ?? 1), 310, y);
    pdf.text(String(prop.mentions), 400, y);
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
  if (!rows.length) pdf.text(t("Реквизит пока не добавлен."), 48, y);
  for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
    pdf.setPage(i);
    pdf.setFontSize(9);
    pdf.text(String(i), width - 40, 815, { align: "right" });
  }
  return pdf.output("blob");
}
export async function exportShotReportPDF(document) {
  const [{ jsPDF }, fonts] = await Promise.all([import("jspdf"), getFonts()]);
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  for (const { style, base64 } of fonts) {
    pdf.addFileToVFS(`ShotReport-${style}.ttf`, base64);
    pdf.addFont(
      `ShotReport-${style}.ttf`,
      "ShotReport",
      {
        Regular: "normal",
        Bold: "bold",
        Italic: "italic",
        BoldItalic: "bolditalic",
      }[style],
    );
  }
  const language = getLanguage() === "en" ? 1 : 0;
  const label = (pair) => pair[language];
  const width = pdf.internal.pageSize.getWidth(),
    height = pdf.internal.pageSize.getHeight();
  const margin = 40,
    usableWidth = width - 2 * margin,
    bottom = height - 46;
  const title = t("Отчёт по кадрам");
  pdf.setProperties({
    title: `${document.title} — ${title}`,
    creator: "Tyter",
  });
  let y = margin;
  const newPage = () => {
    pdf.addPage();
    y = margin;
  };
  const reserve = (amount) => {
    if (y + amount > bottom) newPage();
  };
  const write = (
    text,
    { bold = false, size = 10, indent = 0, color = [51, 47, 59] } = {},
  ) => {
    pdf.setFont("ShotReport", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(
      String(text || " "),
      usableWidth - indent,
    );
    for (const line of lines) {
      reserve(size * 1.5);
      pdf.text(line, margin + indent, y + size);
      y += size * 1.5;
    }
  };
  write(title, { bold: true, size: 18 });
  y += 8;
  write(document.title || t("Без названия"), { bold: true, size: 12 });
  const selectedVersions = new Set(
    screenplayExportPages(document).pages.map((page) => page.versionId),
  );
  write(
    SCRIPT_VERSIONS.filter((version) => selectedVersions.has(version.id))
      .map((version) => version.label)
      .join(" · "),
    { size: 9 },
  );
  write(t("Автоматически · 1 страница = 1 минута"), {
    size: 9,
    color: [107, 100, 118],
  });
  const scenes = shotScenes(document, { allVariants: true });
  const activeSeconds = shotScenes(document).reduce(
    (sum, scene) => sum + scene.seconds,
    0,
  );
  write(
    `${language ? "Active variants duration" : "Хронометраж выбранных вариантов"}: ${durationLabel(activeSeconds)}`,
    { size: 10 },
  );
  y += 18;
  for (const scene of scenes) {
    // Keep the heading and all its settings together, even after a long scene.
    reserve(340);
    pdf.setDrawColor(219, 214, 226);
    pdf.line(margin, y, width - margin, y);
    y += 12;
    write(
      `${t("Сцена {0}", scene.number)} · ${t("Вариант {0}", scene.letter)}`,
      { bold: true, size: 12 },
    );
    write(scene.title || t("Без названия"), { bold: true });
    const settings = scene.settings;
    write(`${t("Название шота")}: ${shotReportName(scene)}`);
    write(`${t("Дата съёмок")}: ${settings.shootingDate || t("Не задано")}`);
    const location = settings.location;
    write(
      `${t("Локация съёмок")}: ${location?.name?.trim() || t("Не задано")}`,
    );
    write(
      `${t("Координаты")}: ${location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : t("Не задано")}`,
    );
    write(
      `${t("Хронометраж сцены")}: ${durationLabel(scene.seconds)} (${scene.pages.toFixed(2)} ${language ? "pages" : "стр."})`,
    );
    for (const field of SHOT_FIELDS) {
      const automatic = field.key === "timeOfDay" && !settings.timeOfDay;
      const value = automatic ? scene.timeOfDay : settings[field.key];
      const option = field.options.find(([id]) => id === value);
      write(
        `${label(field.label)}: ${option ? option[language + 1] + (automatic ? ` · ${t("из заголовка")}` : "") : t("Не задано")}`,
      );
    }
    for (const [key, name] of [
      ["excludeNudity", "Исключить наготу"],
      ["excludeViolence", "Исключить насилие"],
    ])
      write(
        `${t(name)}: ${settings[key] === false ? (language ? "No" : "Нет") : language ? "Yes" : "Да"}`,
      );
    const image = await croppedShotImage(settings.image, settings.aspectRatio);
    if (image) {
      reserve(125);
      const info = pdf.getImageProperties(image);
      const scale = Math.min(usableWidth / info.width, 90 / info.height);
      pdf.addImage(
        image,
        margin,
        y + 6,
        info.width * scale,
        info.height * scale,
      );
      y += info.height * scale + 14;
    }
    write(image ? t("Ваш пример кадра") : t("Кадр не загружен"), { size: 9 });
    y += 8;
    reserve(35);
    write(t("Текст сцены"), { bold: true, size: 11 });
    for (const [index, block] of scene.blocks.entries()) {
      reserve(30);
      write(
        `${index + 1}. ${label(FORMAT_NAMES[block.attrs?.format] || FORMAT_NAMES.action)}: ${shotText(block) || t("Пустой блок")}`,
        { size: 9 },
      );
      y += 5;
    }
    y += 14;
  }
  if (!scenes.length)
    write(language ? "No scenes yet." : "Сцены пока не добавлены.");
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setFont("ShotReport", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(107, 100, 118);
    pdf.text(String(page), width - margin, height - 24, { align: "right" });
  }
  return pdf.output("blob");
}
export function saveBlob(blob, title, extension) {
  const name = documentFileStem(title || "Сценарий");
  const url = URL.createObjectURL(blob),
    link = window.document.createElement("a");
  link.href = url;
  link.download = `${name}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
