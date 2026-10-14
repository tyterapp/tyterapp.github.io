import { DOMSerializer } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { measuredScreenplayPages, screenplayPagePlan } from "./pagination.js";
import { screenplayLayout, screenplayBlockLayout } from "./document-layout.js";

const textNodes = (element) => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement.closest(
        "[contenteditable='false'], .ProseMirror-widget",
      )
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
};

// Mobile is continuous. Measure its logical screenplay pages in an offscreen,
// canonical-width copy; never change the live editor or its selection to paginate it.
function mobilePages(editor, fontSize, documentZoom) {
  const layout = screenplayLayout(fontSize);
  const paper = document.createElement("div");
  const sourcePaper = editor.view.dom.closest(".script-paper");
  const sourceStyle = getComputedStyle(editor.view.dom);
  Object.assign(paper.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${layout.width}px`,
    zoom: String(documentZoom / 100),
    padding: `${layout.top}px ${layout.right}px ${layout.bottom}px ${layout.left}px`,
    boxSizing: "border-box",
    pointerEvents: "none",
    background: getComputedStyle(sourcePaper).backgroundColor,
    color: sourceStyle.color,
    fontFamily: sourceStyle.fontFamily,
    fontSize: `${fontSize}pt`,
    fontSynthesis: sourceStyle.fontSynthesis,
    fontFeatureSettings: sourceStyle.fontFeatureSettings,
    fontVariantLigatures: sourceStyle.fontVariantLigatures,
    letterSpacing: sourceStyle.letterSpacing,
    wordSpacing: sourceStyle.wordSpacing,
    lineHeight: String(layout.lineHeight),
    overflowWrap: "break-word",
    whiteSpace: sourceStyle.whiteSpace,
  });
  paper.setAttribute("aria-hidden", "true");
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const blocks = [],
    positions = new WeakMap();
  editor.state.doc.forEach((node, pos, index) => {
    const element = serializer.serializeNode(node);
    const format = node.attrs.format;
    const block = screenplayBlockLayout(
      format,
      editor.state.doc.child(
        index + 1 < editor.state.doc.childCount ? index + 1 : index,
      ).attrs.format,
    );
    Object.assign(element.style, {
      position: "relative",
      padding: "0",
      border: "0",
      minHeight: "1.25em",
      width: `${block.width * 100}%`,
      margin: `${index ? block.before : 0}px 0 ${block.after}px ${block.left * 100}%`,
      fontWeight: ["scene", "character"].includes(format) ? "700" : "400",
      textAlign: format === "transition" ? "right" : "left",
      textTransform: ["scene", "character", "transition"].includes(format)
        ? "uppercase"
        : "none",
    });
    // No editor CSS: this copy remains stable at every mobile viewport and zoom.
    element.className = "";
    const offsets = [];
    node.descendants((child, at) => {
      if (child.isText) offsets.push(pos + 1 + at);
    });
    textNodes(element).forEach((text, i) => positions.set(text, offsets[i]));
    blocks.push({ node, pos, element });
    paper.append(element);
  });
  document.body.append(paper);
  try {
    const elements = new Map(blocks.map(({ pos, element }) => [pos, element]));
    const plan = screenplayPagePlan({
      doc: editor.state.doc,
      nodeDOM: (pos) => elements.get(pos),
      posAtDOM: (text, offset) => positions.get(text) + offset,
      paper,
      fontSize,
    });
    // Apply from the end so splitting a text node cannot shift earlier offsets.
    for (const { kind, pos, gap, text, offset } of [...plan.breaks].reverse()) {
      if (kind === "node") elements.get(pos).style.paddingTop = `${gap}px`;
      else {
        const tail = text.splitText(offset);
        positions.set(tail, positions.get(text) + offset);
        const spacer = document.createElement("span");
        spacer.contentEditable = "false";
        Object.assign(spacer.style, { display: "block", height: `${gap}px` });
        tail.before(spacer);
      }
    }
    return {
      paper,
      starts: plan.starts,
      count: plan.starts.length,
      height: layout.height,
      positions,
      dispose: () => paper.remove(),
    };
  } catch (error) {
    paper.remove();
    throw error;
  }
}

function pageTexture(editor, pages, from) {
  const { paper, height, count } = pages;
  const bounds = paper.getBoundingClientRect();
  const scale = bounds.width / paper.offsetWidth || 1;
  const top = bounds.top + (count - 1) * height * scale;
  const canvas = document.createElement("canvas");
  const pixelScale = Math.min(1.5, 1536 / height);
  canvas.width = Math.round(paper.offsetWidth * pixelScale);
  canvas.height = Math.round(height * pixelScale);
  const ctx = canvas.getContext("2d");
  ctx.scale(pixelScale, pixelScale);
  ctx.fillStyle = getComputedStyle(paper).backgroundColor;
  ctx.fillRect(0, 0, paper.offsetWidth, height);
  ctx.textBaseline = "top";
  const content = pages.positions ? paper : editor.view.dom;
  for (const text of textNodes(content)) {
    const position =
      pages.positions?.get(text) ?? editor.view.posAtDOM(text, 0);
    if (position + text.length <= from) continue;
    const style = getComputedStyle(text.parentElement);
    const blockStyle = getComputedStyle(
      text.parentElement.closest("p") || text.parentElement,
    );
    const size = parseFloat(style.fontSize);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    let run = "",
      x = 0,
      y = 0,
      lastTop = -Infinity;
    const flush = () => {
      if (!run) return;
      ctx.fillText(run, x, y);
      if (style.textDecorationLine.includes("underline"))
        ctx.fillRect(x, y + size, ctx.measureText(run).width, 1);
      run = "";
    };
    for (let offset = Math.max(0, from - position); offset < text.length;) {
      const char = String.fromCodePoint(text.data.codePointAt(offset));
      const range = document.createRange();
      range.setStart(text, offset);
      range.setEnd(text, offset + char.length);
      const rect = range.getBoundingClientRect();
      offset += char.length;
      if (rect.top < top - 1 || rect.top >= top + height * scale) continue;
      if (Math.abs(rect.top - lastTop) > 1) {
        flush();
        lastTop = rect.top;
        x = (rect.left - bounds.left) / scale;
        y = (rect.top - top) / scale;
      }
      run +=
        blockStyle.textTransform === "uppercase" ? char.toUpperCase() : char;
    }
    flush();
  }
  ctx.font = "10px Inter, sans-serif";
  ctx.fillStyle = "#a39da9";
  ctx.fillText(String(count), paper.offsetWidth - 52, 32);
  return canvas;
}

export function preparePageBurn(
  editor,
  { fontSize = 12, documentZoom = 100 } = {},
) {
  if (
    !editor ||
    editor.isDestroyed ||
    editor.view.composing ||
    !editor.state.doc.textContent.trim()
  )
    return null;
  const before = editor.state.doc;
  const pages =
    measuredScreenplayPages(editor) ||
    mobilePages(editor, fontSize, documentZoom);
  try {
    const from = pages.starts.at(-1);
    const texture = pageTexture(editor, pages, from);
    let used = false;
    return {
      texture,
      page: pages.count,
      commit() {
        if (used || editor.isDestroyed || !editor.state.doc.eq(before))
          return false;
        used = true;
        // One independent undo step, with normal comment-anchor mapping and persistence.
        const tr = closeHistory(editor.state.tr)
          .delete(from, before.content.size)
          .setMeta("skipWritingReward", true);
        if (!tr.docChanged) return false;
        editor.view.dispatch(tr);
        editor.view.dispatch(closeHistory(editor.state.tr));
        return true;
      },
    };
  } finally {
    pages.dispose?.();
  }
}
