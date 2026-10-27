import { screenplayLayout } from "./document-layout.js";

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
function correspondingNode(node, source, target) {
  const path = [];
  while (node && node !== source) {
    path.push(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
    node = node.parentNode;
  }
  if (!node) return null;
  for (const index of path.reverse()) target = target.childNodes[index];
  return target;
}

// A saved boundary can fall inside a line after edits to an earlier page.
// Insert each gap into a detached copy immediately, then measure the remaining
// text again: pre-break line rectangles describe a different wrapping layout.
export function forcedScreenplayPlan({
  doc,
  nodeDOM,
  posAtDOM,
  paper,
  fontSize,
  forcedStarts,
}) {
  const { height: PAGE, top: MARGIN } = screenplayLayout(fontSize);
  const clone = paper.cloneNode(true);
  Object.assign(clone.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    margin: "0",
    width: `${paper.offsetWidth}px`,
    maxWidth: "none",
    transform: "none",
    pointerEvents: "none",
    visibility: "hidden",
  });
  clone.setAttribute("aria-hidden", "true");
  clone.inert = true;
  const blocks = [];
  doc.forEach((node, pos) => {
    const original = nodeDOM(pos);
    if (!(original instanceof HTMLElement)) return;
    const element = correspondingNode(original, paper, clone);
    if (!element) return;
    const sourceTexts = textNodes(original),
      cloneTexts = textNodes(element);
    const texts = cloneTexts.map((text, index) => ({
      text,
      original: sourceTexts[index],
      offset: 0,
      from: posAtDOM(sourceTexts[index], 0),
    }));
    const breakOffsets = [];
    node.descendants((child, offset) => {
      if (child.type.name === "hardBreak") breakOffsets.push(pos + 1 + offset);
    });
    const domBreaks = (root) =>
      [...root.querySelectorAll("br")].filter(
        (br) =>
          !br.classList.contains("ProseMirror-trailingBreak") &&
          !br.closest("[contenteditable='false'], .ProseMirror-widget"),
      );
    const sourceBreaks = domBreaks(original),
      cloneBreaks = domBreaks(element);
    const anchors = breakOffsets.flatMap((from, index) =>
      cloneBreaks[index] && sourceBreaks[index]
        ? [
            {
              from,
              element: cloneBreaks[index],
              originalElement: sourceBreaks[index],
              after: false,
            },
            {
              from: from + 1,
              element: cloneBreaks[index],
              originalElement: sourceBreaks[index],
              after: true,
            },
          ]
        : [],
    );
    if (!node.childCount) {
      const originalBreak = original.querySelector("br"),
        cloneBreak = element.querySelector("br");
      if (originalBreak && cloneBreak)
        anchors.push({
          from: pos + 1,
          element: cloneBreak,
          originalElement: originalBreak,
          after: false,
        });
    }
    blocks.push({
      node,
      pos,
      element,
      sequence: [...texts, ...anchors].sort((a, b) => a.from - b.from),
    });
  });
  paper.parentElement.append(clone);
  try {
    const rect = clone.getBoundingClientRect(),
      origin = rect.top;
    const scale = rect.width / clone.offsetWidth || 1;
    const starts = [0],
      breaks = [];
    let page = 0,
      lastBottom = MARGIN;
    const forced = [
      ...new Set(forcedStarts.filter((at) => at > 0 && at < doc.content.size)),
    ].sort((a, b) => a - b);
    const remaining = new Set(forced);
    const addBreak = (at, top, details, insert) => {
      remaining.delete(at);
      if (starts.at(-1) === at) return;
      page++;
      starts.push(at);
      const gap = Math.max(0, page * PAGE + MARGIN - top);
      const adjusted = insert(gap);
      breaks.push({
        ...details,
        pos: at,
        gap: Number.isFinite(adjusted) ? adjusted : gap,
      });
    };
    for (const { node, pos, element, sequence } of blocks) {
      const before = element.getBoundingClientRect();
      let top = (before.top - origin) / scale;
      const height = before.height / scale;
      const atStart = remaining.has(pos);
      if (atStart) {
        addBreak(pos, top, { kind: "node", size: node.nodeSize }, (gap) => {
          element.style.paddingTop = `${gap}px`;
          top += gap;
        });
      }
      const inside = forced.filter(
        (at) => remaining.has(at) && at > pos && at <= pos + node.nodeSize - 1,
      );
      if (!inside.length && height <= PAGE - MARGIN * 2) {
        if (top + height > (page + 1) * PAGE - MARGIN)
          addBreak(pos, top, { kind: "node", size: node.nodeSize }, (gap) => {
            element.style.paddingTop = `${gap}px`;
          });
      } else {
        for (const source of sequence) {
          if (source.element) {
            if (!remaining.has(source.from)) continue;
            const anchor = document.createTextNode("\u200b");
            if (source.after) source.element.after(anchor);
            else source.element.before(anchor);
            const range = document.createRange();
            range.selectNodeContents(anchor);
            const point = range.getBoundingClientRect();
            addBreak(
              source.from,
              (point.top - origin) / scale,
              {
                kind: "inline",
                element: source.originalElement,
                after: source.after,
              },
              (gap) => {
                const spacer = document.createElement("span");
                spacer.contentEditable = "false";
                spacer.className = "screenplay-page-break ProseMirror-widget";
                Object.assign(spacer.style, {
                  display: "block",
                  height: `${gap}px`,
                });
                anchor.before(spacer);
                const actual =
                  (range.getBoundingClientRect().top - origin) / scale;
                const adjusted = Math.max(
                  0,
                  gap + page * PAGE + MARGIN - actual,
                );
                spacer.style.height = `${adjusted}px`;
                return adjusted;
              },
            );
            anchor.remove();
            continue;
          }
          let text = source.text,
            base = source.from,
            originalOffset = source.offset;
          while (text.length) {
            const range = document.createRange();
            range.selectNodeContents(text);
            const line = [...range.getClientRects()].find(
              (line) =>
                (line.bottom - origin) / scale > (page + 1) * PAGE - MARGIN,
            );
            let naturalOffset = Infinity;
            if (line) {
              let low = 0,
                high = text.length - 1;
              while (low < high) {
                const middle = (low + high) >> 1;
                range.setStart(text, middle);
                range.setEnd(text, middle + 1);
                if (range.getBoundingClientRect().top < line.top - 2)
                  low = middle + 1;
                else high = middle;
              }
              naturalOffset = low;
            }
            const force = inside.find(
              (at) =>
                remaining.has(at) && at >= base && at <= base + text.length,
            );
            const offset = Math.min(
              naturalOffset,
              force === undefined ? Infinity : force - base,
            );
            if (!Number.isFinite(offset)) break;
            const at = base + offset;
            // A boundary at the text's end is still before a following hardBreak.
            range.setStart(text, Math.min(offset, text.length - 1));
            range.setEnd(text, Math.min(offset + 1, text.length));
            const point = range.getBoundingClientRect();
            let tail;
            addBreak(
              at,
              (point.top - origin) / scale,
              {
                kind: "widget",
                text: source.original,
                offset: originalOffset + offset,
              },
              (gap) => {
                tail = text.splitText(offset);
                const spacer = document.createElement("span");
                spacer.contentEditable = "false";
                spacer.className = "screenplay-page-break ProseMirror-widget";
                Object.assign(spacer.style, {
                  display: "block",
                  height: `${gap}px`,
                });
                tail.before(spacer);
                const emptyTail = !tail.length;
                if (emptyTail && tail.nextSibling?.nodeName !== "BR")
                  return gap;
                if (emptyTail) tail.data = "\u200b";
                // A block inserted mid-line also completes the prefix's line.
                // Account for that line box rather than adding an extra line.
                range.setStart(tail, 0);
                range.setEnd(tail, 1);
                const actual =
                  (range.getBoundingClientRect().top - origin) / scale;
                const adjusted = Math.max(
                  0,
                  gap + page * PAGE + MARGIN - actual,
                );
                spacer.style.height = `${adjusted}px`;
                if (emptyTail) tail.data = "";
                return adjusted;
              },
            );
            if (!tail) break;
            text = tail;
            base = at;
            originalOffset += offset;
          }
        }
      }
      lastBottom = (element.getBoundingClientRect().bottom - origin) / scale;
    }
    return {
      breaks,
      starts,
      height: PAGE,
      count: Math.max(1, page + 1, Math.ceil((lastBottom + MARGIN) / PAGE)),
    };
  } finally {
    clone.remove();
  }
}
