import { useEffect, useRef } from "react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { screenplayLayout } from "./document-layout.js";

const pageKey = new PluginKey("screenplay-pages");
export const pageHeightFor = (fontSize) => screenplayLayout(fontSize).height;

export function useScreenplayPagination(
  editor,
  enabled,
  onPageCount,
  fontSize,
  fontFamily,
  documentZoom = 100,
) {
  const callback = useRef(onPageCount);
  callback.current = onPageCount;
  useEffect(() => {
    if (!editor || !enabled) return;
    const PAGE = pageHeightFor(fontSize);
    const MARGIN = screenplayLayout(fontSize).top;
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
      const paperRect = paper.getBoundingClientRect();
      const origin = paperRect.top;
      const scale = paperRect.width / paper.offsetWidth || 1;
      const gaps = [];
      let added = 0,
        page = 0,
        lastBottom = MARGIN;
      editor.state.doc.forEach((node, pos) => {
        const element = editor.view.nodeDOM(pos);
        if (!(element instanceof HTMLElement)) return;
        const rect = element.getBoundingClientRect();
        let top = (rect.top - origin) / scale + added;
        const height = rect.height / scale;
        if (
          top + height > (page + 1) * PAGE - MARGIN &&
          height <= PAGE - MARGIN * 2
        ) {
          page++;
          const gap = Math.max(0, page * PAGE + MARGIN - top);
          gaps.push(
            Decoration.node(pos, pos + node.nodeSize, {
              style: `padding-top:${gap}px;--page-padding:${gap}px`,
            }),
          );
          added += gap;
          top += gap;
        } else if (height > PAGE - MARGIN * 2) {
          // Split long paragraphs at visual line starts without changing their text.
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: (text) =>
                text.parentElement.closest(".ProseMirror-widget")
                  ? NodeFilter.FILTER_REJECT
                  : NodeFilter.FILTER_ACCEPT,
            },
          );
          let textNode;
          while ((textNode = walker.nextNode())) {
            const range = document.createRange();
            range.selectNodeContents(textNode);
            const lines = [...range.getClientRects()];
            for (const line of lines) {
              const bottom = (line.bottom - origin) / scale + added;
              if (bottom <= (page + 1) * PAGE - MARGIN) continue;
              let lo = 0,
                hi = textNode.length - 1;
              while (lo < hi) {
                const mid = (lo + hi) >> 1;
                range.setStart(textNode, mid);
                range.setEnd(textNode, mid + 1);
                if (range.getBoundingClientRect().top < line.top - 2)
                  lo = mid + 1;
                else hi = mid;
              }
              const at = editor.view.posAtDOM(textNode, lo);
              page++;
              const gap = Math.max(
                0,
                page * PAGE + MARGIN - ((line.top - origin) / scale + added),
              );
              added += gap;
              gaps.push(
                Decoration.widget(
                  at,
                  () => {
                    const spacer = document.createElement("span");
                    spacer.className = "screenplay-page-break";
                    spacer.style.height = `${gap}px`;
                    spacer.contentEditable = "false";
                    spacer.setAttribute("aria-hidden", "true");
                    return spacer;
                  },
                  { side: -1, key: `page-${at}-${gap}` },
                ),
              );
            }
          }
        }
        lastBottom = (rect.bottom - origin) / scale + added;
      });
      editor.view.dispatch(
        editor.state.tr.setMeta(
          pageKey,
          DecorationSet.create(editor.state.doc, gaps),
        ),
      );
      callback.current?.(
        Math.max(1, page + 1, Math.ceil((lastBottom + MARGIN) / PAGE)),
      );
      if (scroll && scrollTop != null) scroll.scrollTop = scrollTop;
      measuring = false;
    };
    const schedule = () => {
      if (measuring) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    // Silent content replacements (scene variants, history) still change the
    // document, but deliberately suppress the editor's public update event.
    const changed = ({ transaction }) => {
      if (transaction.docChanged) schedule();
    };
    editor.on("transaction", changed);
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
      cancelAnimationFrame(frame);
      observer.disconnect();
      editor.off("transaction", changed);
      if (!editor.isDestroyed) editor.unregisterPlugin(pageKey);
    };
  }, [editor, enabled, fontSize, fontFamily, documentZoom]);
}
