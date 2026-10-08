import { dramaValue, clampDocumentZoom } from "./document-layout.js";
import { documentFont } from "./document-fonts.js";
import { cleanSceneVariants, SCENE_VARIANTS } from "./scene-variants.js";

const FORMATS = new Set([
  "scene",
  "action",
  "character",
  "speech",
  "parenthetical",
  "transition",
  "plain",
]);
const CATEGORIES = new Set([
  "Costumes",
  "Locations",
  "Objects",
  "Vehicles",
  "Sound",
]);
const DEFAULT_SETTINGS = {
  lineHighlight: true,
  minimap: false,
  timeline: false,
  components: false,
  formatLabels: false,
  spellcheck: false,
};

export function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`
  );
}

const paragraph = (format, text, blockId = uid()) => ({
  type: "paragraph",
  attrs: { format, blockId },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});

export function createProject(title = "Untitled") {
  return {
    id: uid(),
    title: String(title).trim().slice(0, 160) || "Untitled",
    updatedAt: new Date().toISOString(),
    starred: false,
    cover: null,
    content: {
      type: "doc",
      content: [paragraph("scene", "INT. — DAY"), paragraph("action", "")],
    },
    components: [],
    props: [],
    propFolders: [],
    collapsedPropFolders: [],
    comments: [],
    outline: { columns: [], cards: [] },
    sceneVariants: {},
    settings: { ...DEFAULT_SETTINGS },
    metadata: {
      fontSize: 12,
      documentZoom: 100,
      fontFamily: "courier",
      formatBarMode: "text",
      author: "",
      year: "",
      email: "",
      poster: null,
    },
  };
}

const wire = createProject("The Wire");
wire.id = "project-the-wire";
wire.cover = "wire";
wire.starred = true;
wire.content = {
  type: "doc",
  content: [
    paragraph("scene", "INT. OFFICE — DAY", "wire-scene-1"),
    paragraph(
      "action",
      "Eight men dressed in BLACK SUITS sit around a table in a quiet corner of the cafe. Morning light settles on half-empty coffee cups. MR. PINK turns a teaspoon between his fingers while the others finish breakfast. At the head of the table, JOE CABOT opens a small notebook. No one notices the rain beginning outside. Pink watches a drop travel down the window, then looks back at the table. He has been waiting all morning to tell this story.",
      "wire-action-1",
    ),
    paragraph("scene", "INT. OFFICE — DAY", "wire-scene-2"),
    paragraph(
      "action",
      "The men in BLACK SUITS have pushed their plates aside. Joe closes his notebook and listens. Across the table, Mr. Blue folds a paper napkin into a small, uneven square. Pink leans back in his chair, searching for the right words. The cafe grows quieter around them. For a moment, even the coffee machine is still.",
      "wire-action-2",
    ),
    paragraph("transition", "FADE OUT:", "wire-transition-1"),
    paragraph(
      "action",
      "Outside, the rain has stopped. A waiter gathers the empty cups. Pink stays at the table, watching the others disappear through the cafe’s front door.",
      "wire-action-3",
    ),
    paragraph("character", "MR. PINK", "wire-character-1"),
    paragraph("parenthetical", "(quietly)", "wire-parenthetical-1"),
    paragraph(
      "speech",
      "Funny how you can spend a whole morning talking and still leave the important things unsaid. Maybe that’s why we keep coming back. There’s always one more story to tell.",
      "wire-speech-1",
    ),
  ],
};
wire.components = [
  {
    id: "component-mr-pink",
    name: "Mr. Pink",
    type: "character",
    description: "Observant, restless, and always ready with a story.",
    color: "#9b66e8",
  },
  {
    id: "component-office",
    name: "Office",
    type: "place",
    description: "A quiet corner of a neighborhood cafe.",
    color: "#5574df",
  },
];
wire.props = [
  {
    id: "prop-black-suits",
    name: "BLACK SUITS",
    category: "Costumes",
    quantity: 8,
    description: "Matching dark suits for the men at the table.",
    blockId: "wire-action-1",
    color: "#f16d55",
  },
  {
    id: "prop-office",
    name: "INT. OFFICE",
    category: "Locations",
    quantity: 1,
    description: "Neighborhood cafe · interior",
    blockId: "wire-scene-1",
    color: "#5678ec",
  },
];
wire.comments = [
  {
    id: "comment-wire-1",
    text: "Let’s hold on this moment a little longer. The silence could tell us more about Pink.",
    quote: "Pink watches a drop travel down the window",
    blockId: "wire-action-1",
    author: "Alex Morgan",
    createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    resolved: false,
  },
  {
    id: "comment-wire-2",
    text: "A lovely closing beat. Could the last line connect to the opening scene?",
    quote: "There’s always one more story to tell.",
    blockId: "wire-speech-1",
    author: "Alex Morgan",
    createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    resolved: false,
  },
];

// Split only the annotated text into marks; the rest stays ordinary editable text.
for (const comment of wire.comments) {
  const node = wire.content.content.find(
    (item) => item.attrs.blockId === comment.blockId,
  );
  const text = node.content[0].text;
  const start = text.indexOf(comment.quote);
  if (start < 0) continue;
  node.content = [
    ...(start ? [{ type: "text", text: text.slice(0, start) }] : []),
    {
      type: "text",
      text: comment.quote,
      marks: [{ type: "comment", attrs: { id: comment.id } }],
    },
    ...(start + comment.quote.length < text.length
      ? [{ type: "text", text: text.slice(start + comment.quote.length) }]
      : []),
  ];
}

for (const prop of wire.props) {
  for (const block of wire.content.content) {
    block.content = (block.content || []).flatMap((part) => {
      if (part.type !== "text") return [part];
      const pieces = [];
      let offset = 0;
      for (
        let start = part.text.indexOf(prop.name);
        start !== -1;
        start = part.text.indexOf(prop.name, offset)
      ) {
        if (start > offset)
          pieces.push({ ...part, text: part.text.slice(offset, start) });
        pieces.push({
          ...part,
          text: prop.name,
          marks: [
            ...(part.marks || []),
            { type: "entity", attrs: { id: prop.id, color: prop.color } },
          ],
        });
        offset = start + prop.name.length;
      }
      if (offset < part.text.length)
        pieces.push({ ...part, text: part.text.slice(offset) });
      return pieces;
    });
  }
}

const hokum = createProject("Hokum");
hokum.id = "project-hokum";
hokum.cover = "hokum";
hokum.content = {
  type: "doc",
  content: [
    paragraph("scene", "INT. OLD HOTEL — NIGHT", "hokum-scene-1"),
    paragraph(
      "action",
      "The elevator stops on a floor that does not appear on the panel. Daniel steps into a narrow corridor. Behind him, the doors close without a sound.",
      "hokum-action-1",
    ),
    paragraph("character", "DANIEL"),
    paragraph("speech", "Hello? I think I’m on the wrong floor."),
  ],
};
const hoppers = createProject("Hoppers");
hoppers.id = "project-hoppers";
hoppers.cover = "hoppers";
hoppers.content = {
  type: "doc",
  content: [
    paragraph("scene", "EXT. FOREST POND — MORNING", "hoppers-scene-1"),
    paragraph(
      "action",
      "Sunlight skips across the pond. A small beaver balances on a branch, studying the strange machine on the bank. It hums, blinks, and offers absolutely no explanation.",
      "hoppers-action-1",
    ),
    paragraph("character", "MABEL"),
    paragraph(
      "speech",
      "Okay. One small step. How hard can being a beaver be?",
    ),
  ],
};
const untitled = createProject("Untitled");
untitled.id = "project-untitled";
for (const project of [wire, hokum, hoppers])
  project.updatedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
export const initialProjects = [wire, hokum, hoppers, untitled];

export const nodeText = (node) =>
  (node?.content || [])
    .map((part) =>
      part.type === "hardBreak"
        ? "\n"
        : part.type === "text"
          ? part.text || ""
          : "",
    )
    .join("");

export function getScenes(content) {
  const nodes = content?.content || [];
  const scenes = [];
  let lines = 0;
  nodes.forEach((node, index) => {
    const format = node.attrs?.format || "action";
    const text = nodeText(node);
    if (format === "scene") {
      let description = "";
      for (let next = index + 1; next < nodes.length; next++) {
        if (nodes[next].attrs?.format === "scene") break;
        if (nodes[next].attrs?.format === "action") {
          description = nodeText(nodes[next]);
          break;
        }
      }
      scenes.push({
        id: node.attrs?.blockId || `scene-${index}`,
        title: text.toUpperCase() || "UNTITLED SCENE",
        text: description,
        index,
        page: Math.floor(lines / 55) + 1,
      });
    }
    const width =
      format === "speech"
        ? 35
        : format === "parenthetical"
          ? 26
          : format === "character"
            ? 30
            : 62;
    lines += Math.max(
      1,
      text
        .split("\n")
        .reduce(
          (count, line) => count + Math.max(1, Math.ceil(line.length / width)),
          0,
        ),
    );
    if (!["character", "parenthetical"].includes(format)) lines++;
  });
  return scenes;
}

export function getWordCount(content) {
  return (content?.content || []).reduce(
    (total, node) =>
      total +
      (nodeText(node).match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || [])
        .length,
    0,
  );
}

const cleanText = (value, max = 20000) =>
  typeof value === "string" ? value.slice(0, max) : "";
const cleanId = (value) =>
  typeof value === "string" && /^[\w-]{1,100}$/.test(value) ? value : uid();
const cleanColor = (value, fallback = "#9b66e8") =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const cleanDate = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : new Date().toISOString();
const cleanThumbnail = (value) =>
  typeof value === "string" &&
  value.length < 1024 * 1024 &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : null;

export function validateImport(input) {
  let source = input;
  if (typeof input === "string") {
    try {
      source = JSON.parse(input);
    } catch {
      throw new Error(
        "This file is not valid JSON. Choose an exported Tyter project.",
      );
    }
  }
  if (
    !source ||
    typeof source !== "object" ||
    Array.isArray(source) ||
    source.content?.type !== "doc" ||
    !Array.isArray(source.content.content)
  ) {
    throw new Error(
      "This file is not a screenplay project. Choose an exported Tyter JSON file.",
    );
  }
  if (source.content.content.length > 20000)
    throw new Error("This screenplay has too many paragraphs to import.");
  const usedIds = new Set();
  const content = source.content.content
    .filter((node) => node?.type === "paragraph")
    .map((node) => {
      let blockId = cleanId(node.attrs?.blockId);
      if (usedIds.has(blockId)) blockId = uid();
      usedIds.add(blockId);
      const children = (
        Array.isArray(node.content) ? node.content : []
      ).flatMap((part) => {
        if (part?.type === "hardBreak") return [{ type: "hardBreak" }];
        if (
          part?.type !== "text" ||
          typeof part.text !== "string" ||
          !part.text
        )
          return [];
        const marks = (Array.isArray(part.marks) ? part.marks : []).flatMap(
          (mark) => {
            if (mark?.type === "comment" && typeof mark.attrs?.id === "string")
              return [
                { type: "comment", attrs: { id: cleanId(mark.attrs.id) } },
              ];
            if (mark?.type === "entity" && typeof mark.attrs?.id === "string")
              return [
                {
                  type: "entity",
                  attrs: {
                    id: cleanId(mark.attrs.id),
                    color: cleanColor(mark.attrs.color),
                    automatic: mark.attrs.automatic === true,
                  },
                },
              ];
            if (["bold", "italic", "underline", "strike"].includes(mark?.type))
              return [{ type: mark.type }];
            return [];
          },
        );
        return [
          {
            type: "text",
            text: cleanText(part.text, 250000),
            ...(marks.length ? { marks } : {}),
          },
        ];
      });
      return {
        type: "paragraph",
        attrs: {
          format: FORMATS.has(node.attrs?.format)
            ? node.attrs.format
            : "action",
          blockId,
          sceneVariant:
            node.attrs?.format === "scene" &&
            SCENE_VARIANTS.includes(node.attrs.sceneVariant)
              ? node.attrs.sceneVariant
              : null,
        },
        ...(children.length ? { content: children } : {}),
      };
    });
  if (!content.length)
    throw new Error("No screenplay paragraphs were found in this file.");
  const list = (value) =>
    Array.isArray(value)
      ? value.filter((item) => item && typeof item === "object").slice(0, 10000)
      : [];
  const uniqueItems = (items) => {
    const ids = new Set();
    return items.map((item) => {
      if (ids.has(item.id)) item.id = uid();
      ids.add(item.id);
      return item;
    });
  };
  const propFolders = uniqueItems(
    list(source.propFolders)
      .filter((item) => cleanText(item.name).trim())
      .map((item) => ({
        id: cleanId(item.id),
        name: cleanText(item.name, 100).trim(),
      })),
  );
  const sceneVariants = cleanSceneVariants(
    source.sceneVariants,
    content,
    (blocks) =>
      validateImport({ content: { type: "doc", content: blocks } }).content
        .content,
  );
  for (const versions of Object.values(sceneVariants))
    for (const blocks of Object.values(versions))
      for (const block of blocks) usedIds.add(block.attrs.blockId);
  return {
    id: cleanId(source.id),
    title: cleanText(source.title, 160).trim() || "Untitled",
    updatedAt: cleanDate(source.updatedAt),
    starred: source.starred === true,
    quotaExempt: source.quotaExempt === true,
    cover: ["wire", "hokum", "hoppers"].includes(source.cover)
      ? source.cover
      : null,
    content: { type: "doc", content },
    sceneVariants,
    metadata: {
      fontFamily: documentFont(source.metadata?.fontFamily).id,
      fontSize: Number.isFinite(Number(source.metadata?.fontSize))
        ? Math.max(12, Math.min(26, Number(source.metadata.fontSize)))
        : 12,
      documentZoom: clampDocumentZoom(source.metadata?.documentZoom),
      formatBarMode:
        source.metadata?.formatBarMode === "icons" ? "icons" : "text",
      author: cleanText(source.metadata?.author, 200),
      year: cleanText(source.metadata?.year, 4).replace(/\D/g, ""),
      email: cleanText(source.metadata?.email, 254),
      poster:
        typeof source.metadata?.poster === "string" &&
        source.metadata.poster.length < 7 * 1024 * 1024 &&
        /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
          source.metadata.poster,
        )
          ? source.metadata.poster
          : null,
    },
    componentFolders: uniqueItems(
      list(source.componentFolders)
        .filter((item) => cleanText(item.name).trim())
        .map((item) => ({
          id: cleanId(item.id),
          name: cleanText(item.name, 100).trim(),
        })),
    ),
    collapsedComponentFolders: Array.isArray(source.collapsedComponentFolders)
      ? source.collapsedComponentFolders
          .filter((id) => typeof id === "string")
          .slice(0, 10000)
      : [],
    propFolders,
    collapsedPropFolders: Array.isArray(source.collapsedPropFolders)
      ? source.collapsedPropFolders
          .filter(
            (id) => id === "" || propFolders.some((folder) => folder.id === id),
          )
          .slice(0, 10000)
      : [],
    outline: {
      columns: uniqueItems(
        list(source.outline?.columns).map((column) => ({
          id: cleanId(column.id),
          title: cleanText(column.title, 100).trim() || "Акт",
          ...(typeof column.collapsed === "boolean"
            ? { collapsed: column.collapsed }
            : {}),
        })),
      ),
      cards: uniqueItems(
        list(source.outline?.cards).map((card) => ({
          id: cleanId(card.id),
          columnId: cleanId(card.columnId),
          title: cleanText(card.title, 200).trim() || "Без названия",
          text: cleanText(card.text, 20000),
          color: cleanColor(card.color, "#33313b"),
          drama: dramaValue(card.drama),
          blockId: usedIds.has(card.blockId) ? card.blockId : null,
          comments: uniqueItems(
            list(card.comments)
              .filter((comment) => cleanText(comment.text).trim())
              .map((comment) => ({
                id: cleanId(comment.id),
                text: cleanText(comment.text, 10000).trim(),
                createdAt: cleanDate(comment.createdAt),
              })),
          ),
        })),
      ),
    },
    components: uniqueItems(
      list(source.components)
        .filter((item) => cleanText(item.name).trim())
        .map((item) => ({
          id: cleanId(item.id),
          name: cleanText(item.name, 200).trim(),
          type: item.type === "place" ? "place" : "character",
          description: cleanText(item.description, 5000),
          color: cleanColor(item.color),
          thumbnail: cleanThumbnail(item.thumbnail),
          ...(item.librarySource &&
          typeof item.librarySource.libraryId === "string" &&
          typeof item.librarySource.componentId === "string"
            ? {
                librarySource: {
                  libraryId: cleanId(item.librarySource.libraryId),
                  componentId: cleanId(item.librarySource.componentId),
                  name: cleanText(item.librarySource.name, 160),
                },
              }
            : {}),
          folderId:
            typeof item.folderId === "string" &&
            list(source.componentFolders).some(
              (folder) => folder.id === item.folderId,
            )
              ? item.folderId
              : null,
        })),
    ),
    props: uniqueItems(
      list(source.props)
        .filter((item) => cleanText(item.name).trim())
        .map((item) => ({
          id: cleanId(item.id),
          name: cleanText(item.name, 200).trim(),
          category: CATEGORIES.has(item.category) ? item.category : "Objects",
          folderId:
            typeof item.folderId === "string" &&
            propFolders.some((folder) => folder.id === item.folderId)
              ? item.folderId
              : null,
          componentId:
            typeof item.componentId === "string" ? item.componentId : null,
          quantity: Number.isFinite(Number(item.quantity))
            ? Math.max(1, Math.min(999999, Math.round(Number(item.quantity))))
            : 1,
          description: cleanText(item.description, 5000),
          blockId: usedIds.has(item.blockId) ? item.blockId : null,
          color: cleanColor(item.color, "#f16d55"),
          thumbnail: cleanThumbnail(item.thumbnail),
        })),
    ),
    comments: uniqueItems(
      list(source.comments)
        .filter((item) => cleanText(item.text).trim())
        .map((item) => ({
          id: cleanId(item.id),
          text: cleanText(item.text, 10000).trim(),
          quote: cleanText(item.quote, 5000),
          blockId: usedIds.has(item.blockId) ? item.blockId : null,
          author: cleanText(item.author, 100) || "Alex Morgan",
          createdAt: cleanDate(item.createdAt),
          resolved: item.resolved === true,
          anchor:
            Number.isInteger(item.anchor) && item.anchor >= 0
              ? item.anchor
              : null,
        })),
    ),
    settings: Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) => [
        key,
        typeof source.settings?.[key] === "boolean"
          ? source.settings[key]
          : fallback,
      ]),
    ),
  };
}

export function toFountain(project) {
  const nodes = project?.content?.content || [];
  const lines = [
    `Title: ${(project?.title || "Untitled").replace(/[\r\n]/g, " ")}`,
    "",
  ];
  nodes.forEach((node, index) => {
    const format = node.attrs?.format || "action";
    let text = nodeText(node);
    if (format === "scene") {
      text = text.toUpperCase();
      if (!/^(INT\.?|EXT\.?|EST\.?|I\/?E\.?|INT\.?\/?EXT\.?)\s/i.test(text))
        text = `.${text}`;
    }
    if (format === "character") text = `@${text.toUpperCase()}`;
    if (format === "parenthetical")
      text = `(${text.replace(/^\(/, "").replace(/\)$/, "")})`;
    if (format === "transition") text = `> ${text.toUpperCase()}`;
    lines.push(text);
    const nextFormat = nodes[index + 1]?.attrs?.format;
    if (!(
      (format === "character" &&
        ["parenthetical", "speech"].includes(nextFormat)) ||
      (format === "parenthetical" && nextFormat === "speech") ||
      (format === "speech" && nextFormat === "parenthetical")
    ))
      lines.push("");
  });
  return lines.join("\n").trimEnd() + "\n";
}

export function makePropsCSV(project) {
  const scenes = getScenes(project?.content);
  const nodes = project?.content?.content || [];
  const cell = (value) => {
    let text = String(value ?? "");
    // Spreadsheet programs treat these prefixes as formulas even inside CSV quotes.
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [
    ["Category", "Name", "Quantity", "Description", "Scene", "Page"],
  ];
  for (const prop of project?.props || []) {
    const index = nodes.findIndex(
      (node) => node.attrs?.blockId === prop.blockId,
    );
    const scene = scenes.filter((item) => item.index <= index).at(-1);
    rows.push([
      prop.category,
      prop.name,
      prop.quantity,
      prop.description,
      scene?.title || "",
      scene?.page || "",
    ]);
  }
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
