import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { isArrowOnly } from "./arrow-text.js";

export function createArrowDecorations() {
  const paragraphs = new WeakMap(), documents = new WeakMap();
  return (doc) => {
    if (documents.has(doc)) return documents.get(doc);
    const decorations = [];
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      let analysis = paragraphs.get(node);
      if (!analysis) {
        analysis = { centered: isArrowOnly(node.textContent), ranges: [] };
        node.descendants((part, offset) => {
          if (part.isText) for (const match of part.text.matchAll(/[\u2190-\u21ff]+/gu))
            analysis.ranges.push([offset + 1 + match.index, offset + 1 + match.index + match[0].length]);
        });
        paragraphs.set(node, analysis);
      }
      if (analysis.centered) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "script-arrow-row", style: "text-align:center" }));
      for (const [from, to] of analysis.ranges) decorations.push(Decoration.inline(pos + from, pos + to, { class: "script-arrow" }));
      return false;
    });
    const result = DecorationSet.create(doc, decorations);
    documents.set(doc, result);
    return result;
  };
}
