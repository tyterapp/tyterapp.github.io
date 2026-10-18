import { DOMSerializer } from "@tiptap/pm/model";
import { screenplayPagePlan } from "./pagination.js";
import { screenplayLayout, screenplayBlockLayout } from "./document-layout.js";
import { isArrowOnly } from "./arrow-text.js";

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
export function canonicalScreenplayPages(
  editor,
  fontSize,
  documentZoom,
  { content, forcedStarts = [] } = {},
) {
  const layout = screenplayLayout(fontSize);
  const doc = content ? editor.schema.nodeFromJSON(content) : editor.state.doc;
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
  doc.forEach((node, pos, index) => {
    const element = serializer.serializeNode(node);
    const format = node.attrs.format;
    const block = screenplayBlockLayout(
      format,
      doc.child(index + 1 < doc.childCount ? index + 1 : index).attrs.format,
    );
    Object.assign(element.style, {
      position: "relative",
      padding: "0",
      border: "0",
      minHeight: "1.25em",
      width: `${block.width * 100}%`,
      margin: `${index ? block.before : 0}px 0 ${block.after}px ${block.left * 100}%`,
      fontWeight: ["scene", "character"].includes(format) ? "700" : "400",
      textAlign: isArrowOnly(node.textContent)
        ? "center"
        : format === "transition"
          ? "right"
          : "left",
      textTransform: ["scene", "character", "transition"].includes(format)
        ? "uppercase"
        : "none",
    });
    // No editor CSS: this copy remains stable at every mobile viewport and zoom.
    element.className = "";
    // ProseMirror supplies a trailing BR for an empty paragraph. The serializer
    // does not; without it border-box padding can consume its entire min-height
    // and make a saved empty page disappear from canonical measurements.
    if (!node.childCount || node.lastChild?.type.name === "hardBreak") {
      const trailingBreak = document.createElement("br");
      trailingBreak.className = "ProseMirror-trailingBreak";
      element.append(trailingBreak);
    }
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
      doc,
      nodeDOM: (pos) => elements.get(pos),
      posAtDOM: (text, offset) => positions.get(text) + offset,
      paper,
      fontSize,
      forcedStarts,
    });
    // Apply from the end so splitting a text node cannot shift earlier offsets.
    for (const { kind, pos, gap, text, offset, element, after } of [
      ...plan.breaks,
    ].reverse()) {
      if (kind === "node") elements.get(pos).style.paddingTop = `${gap}px`;
      else {
        const spacer = document.createElement("span");
        spacer.contentEditable = "false";
        Object.assign(spacer.style, { display: "block", height: `${gap}px` });
        if (kind === "inline") {
          if (after) element.after(spacer);
          else element.before(spacer);
        } else {
          const tail = text.splitText(offset);
          positions.set(tail, positions.get(text) + offset);
          tail.before(spacer);
        }
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
