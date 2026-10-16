import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { measuredScreenplayPages } from "./pagination.js";
import { canonicalScreenplayPages } from "./canonical-pages.js";

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

function pageTexture(editor, pages, from, region) {
  const { paper, height, count } = pages;
  const bounds = paper.getBoundingClientRect();
  const scale = bounds.width / paper.offsetWidth || 1;
  const sliceHeight = region?.height || height;
  const top = bounds.top + (region?.top ?? (count - 1) * height) * scale;
  const canvas = document.createElement("canvas");
  const pixelScale = Math.min(
    1.5,
    1536 / Math.max(sliceHeight, paper.offsetWidth),
  );
  canvas.width = Math.round(paper.offsetWidth * pixelScale);
  canvas.height = Math.max(1, Math.round(sliceHeight * pixelScale));
  const ctx = canvas.getContext("2d");
  ctx.scale(pixelScale, pixelScale);
  const revision = paper.querySelector(
    `.revision-page-background[data-page="${count}"]:not([data-revision-color="white"])`,
  );
  ctx.fillStyle = getComputedStyle(revision || paper).backgroundColor;
  ctx.fillRect(0, 0, paper.offsetWidth, sliceHeight);
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
      if (rect.top < top - 1 || rect.top >= top + sliceHeight * scale) continue;
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
  if (!region?.mobile) {
    ctx.font = "10px Inter, sans-serif";
    ctx.fillStyle = "#a39da9";
    ctx.fillText(String(count), paper.offsetWidth - 52, 32);
  }
  return canvas;
}

export function preparePageBurn(
  editor,
  { fontSize = 12, documentZoom = 100 } = {},
) {
  if (!editor || editor.isDestroyed || editor.view.composing) return null;
  const before = editor.state.doc;
  const pages =
    measuredScreenplayPages(editor) ||
    canonicalScreenplayPages(editor, fontSize, documentZoom);
  try {
    const from = pages.starts.at(-1);
    const paper = editor.view.dom.closest(".script-paper");
    const scroller = paper.closest(".minimal-scroll");
    const mobile = !!pages.positions;
    const single = pages.count === 1;
    const region = () => {
      const bounds = paper.getBoundingClientRect();
      const scale = bounds.width / paper.offsetWidth || 1;
      const top = single
        ? 0
        : mobile
          ? Math.max(
              0,
              (editor.view.coordsAtPos(
                from + (before.nodeAt(from)?.isBlock ? 1 : 0),
              ).top -
                bounds.top) /
                scale -
                10,
            )
          : (pages.count - 1) * pages.height;
      return {
        top,
        height: mobile
          ? Math.max(1, bounds.height / scale - top)
          : pages.height,
        mobile,
      };
    };
    const slice = region();
    const texture = pageTexture(
      editor,
      { paper, height: slice.height, count: pages.count },
      from,
      slice,
    );
    let used = false;
    return {
      texture,
      page: pages.count,
      paper,
      scroller,
      single,
      region: slice,
      resetTexture() {
        const height =
          paper.getBoundingClientRect().height /
          (paper.getBoundingClientRect().width / paper.offsetWidth || 1);
        return pageTexture(editor, { paper, count: 1, height }, 0, {
          top: 0,
          height,
          mobile,
        });
      },
      commit() {
        if (used || editor.isDestroyed || !editor.state.doc.eq(before))
          return false;
        used = true;
        // One independent undo step, with normal comment-anchor mapping and persistence.
        const tr = closeHistory(editor.state.tr);
        if (single) {
          // A fresh empty scene and action, within this document/version only.
          tr.replaceWith(
            0,
            before.content.size,
            ["scene", "action"].map((format) =>
              editor.schema.nodes.paragraph.create({
                format,
                blockId: crypto.randomUUID(),
              }),
            ),
          );
          tr.setSelection(TextSelection.atStart(tr.doc));
        } else tr.delete(from, before.content.size);
        tr.setMeta("skipWritingReward", true);
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
