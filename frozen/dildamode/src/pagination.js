import { useEffect, useRef } from "react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { screenplayLayout } from "./document-layout.js";
import { pageRevisionColors } from "./script-revisions.js";
import { forcedScreenplayPlan } from "./pagination-forced.js";
import { pageVersionBreaks } from "./page-versions.js";

const pageKey = new PluginKey("screenplay-pages");
const pageMeasurements = new WeakMap();
// A destructive page action must use a fresh layout, including changes made this frame.
export const measuredScreenplayPages = (editor) =>
  pageMeasurements.get(editor)?.();
export const pageHeightFor = (fontSize) => screenplayLayout(fontSize).height;

// Shared by visible pagination and the mobile action's offscreen screenplay.
export function screenplayPagePlan({
  doc,
  nodeDOM,
  posAtDOM,
  paper,
  fontSize,
  forcedStarts = [],
}) {
  if (forcedStarts.some((at) => at > 0 && at < doc.content.size))
    return forcedScreenplayPlan({
      doc,
      nodeDOM,
      posAtDOM,
      paper,
      fontSize,
      forcedStarts,
    });
  const PAGE = pageHeightFor(fontSize),
    MARGIN = screenplayLayout(fontSize).top;
  const paperRect = paper.getBoundingClientRect();
  const origin = paperRect.top,
    scale = paperRect.width / paper.offsetWidth || 1;
  const breaks = [],
    starts = [0];
  let added = 0,
    page = 0,
    lastBottom = MARGIN;
  doc.forEach((node, pos) => {
    const element = nodeDOM(pos);
    if (!(element instanceof HTMLElement)) return;
    const rect = element.getBoundingClientRect();
    let top = (rect.top - origin) / scale + added;
    const height = rect.height / scale;
    if (
      top + height > (page + 1) * PAGE - MARGIN &&
      height <= PAGE - MARGIN * 2
    ) {
      page++;
      starts.push(pos);
      const gap = Math.max(0, page * PAGE + MARGIN - top);
      breaks.push({ kind: "node", pos, size: node.nodeSize, gap });
      added += gap;
      top += gap;
    } else if (height > PAGE - MARGIN * 2) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: (text) =>
          text.parentElement.closest(
            "[contenteditable='false'], .ProseMirror-widget",
          )
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      });
      let text;
      while ((text = walker.nextNode())) {
        const range = document.createRange();
        range.selectNodeContents(text);
        const lines = [...range.getClientRects()];
        for (const line of lines) {
          if (
            (line.bottom - origin) / scale + added <=
            (page + 1) * PAGE - MARGIN
          )
            continue;
          let lo = 0,
            hi = text.length - 1;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            range.setStart(text, mid);
            range.setEnd(text, mid + 1);
            if (range.getBoundingClientRect().top < line.top - 2) lo = mid + 1;
            else hi = mid;
          }
          const at = posAtDOM(text, lo);
          page++;
          starts.push(at);
          const gap = Math.max(
            0,
            page * PAGE + MARGIN - ((line.top - origin) / scale + added),
          );
          added += gap;
          breaks.push({ kind: "widget", pos: at, gap, text, offset: lo });
        }
      }
    }
    lastBottom = (rect.bottom - origin) / scale + added;
  });
  return {
    breaks,
    starts,
    height: PAGE,
    count: Math.max(1, page + 1, Math.ceil((lastBottom + MARGIN) / PAGE)),
  };
}

export function useScreenplayPagination(
  editor,
  enabled,
  onPageCount,
  fontSize,
  fontFamily,
  documentZoom = 100,
  onRevisionPages,
  getPageVersions,
) {
  const callback = useRef(onPageCount);
  callback.current = onPageCount;
  const revisions = useRef(onRevisionPages);
  revisions.current = onRevisionPages;
  const versionState = useRef(getPageVersions);
  versionState.current = getPageVersions;
  useEffect(() => {
    if (!editor || !enabled) return;
    const PAGE = pageHeightFor(fontSize);
    let frame,
      measuring = false,
      stopped = false;
    const plugin = new Plugin({
      key: pageKey,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, previous) =>
          tr.getMeta(pageKey) ?? previous.map(tr.mapping, tr.doc),
      },
      props: { decorations: (state) => pageKey.getState(state) },
    });
    editor.registerPlugin(plugin);
    const measure = () => {
      if (
        stopped ||
        editor.isDestroyed ||
        editor.view.composing ||
        !editor.view.dom.getClientRects().length
      )
        return;
      measuring = true;
      const scroll = editor.view.dom.closest(".minimal-scroll");
      const scrollTop = scroll?.scrollTop;
      editor.view.dispatch(
        editor.state.tr.setMeta(pageKey, DecorationSet.empty),
      );
      const paper = editor.view.dom.closest(".script-paper");
      const plan = screenplayPagePlan({
        doc: editor.state.doc,
        nodeDOM: (pos) => editor.view.nodeDOM(pos),
        posAtDOM: (text, offset) => editor.view.posAtDOM(text, offset),
        paper,
        fontSize,
        forcedStarts: pageVersionBreaks(versionState.current?.()),
      });
      const gaps = plan.breaks.map(({ kind, pos, size, gap }) =>
        kind === "node"
          ? Decoration.node(pos, pos + size, {
              style: `padding-top:${gap}px;--page-padding:${gap}px`,
            })
          : Decoration.widget(
              pos,
              () => {
                const spacer = document.createElement("span");
                spacer.className = "screenplay-page-break";
                spacer.style.height = `${gap}px`;
                spacer.contentEditable = "false";
                spacer.setAttribute("aria-hidden", "true");
                return spacer;
              },
              { side: -1, key: `page-${pos}-${gap}` },
            ),
      );
      editor.view.dispatch(
        editor.state.tr.setMeta(
          pageKey,
          DecorationSet.create(editor.state.doc, gaps),
        ),
      );
      callback.current?.(plan.count);
      if (revisions.current) {
        const colors = pageRevisionColors(
          editor.state.doc,
          plan.starts,
          plan.count,
        );
        revisions.current(
          colors.map((version, index) => ({
            version,
            from: plan.starts[index],
            to: plan.starts[index + 1] ?? editor.state.doc.content.size,
            top: index * PAGE,
            height: PAGE,
          })),
        );
      }
      if (scroll && scrollTop != null) scroll.scrollTop = scrollTop;
      measuring = false;
      return {
        starts: plan.starts,
        count: plan.starts.length,
        paper,
        height: PAGE,
      };
    };
    pageMeasurements.set(editor, measure);
    const schedule = () => {
      if (measuring) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    // Silent content replacements (scene variants, history) still change the
    // document, but deliberately suppress the editor's public update event.
    const changed = ({ transaction }) => {
      if (transaction.docChanged || transaction.getMeta("pageVersionLayout"))
        schedule();
    };
    editor.on("transaction", changed);
    editor.view.dom.addEventListener("compositionend", schedule);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== observer.lastWidth) {
        observer.lastWidth = width;
        schedule();
      }
    });
    observer.observe(editor.view.dom);
    document.fonts.ready.then(() => {
      if (!stopped) schedule();
    });
    schedule();
    return () => {
      stopped = true;
      pageMeasurements.delete(editor);
      cancelAnimationFrame(frame);
      observer.disconnect();
      editor.off("transaction", changed);
      editor.view.dom.removeEventListener("compositionend", schedule);
      if (!editor.isDestroyed) editor.unregisterPlugin(pageKey);
    };
  }, [editor, enabled, fontSize, fontFamily, documentZoom]);
}
