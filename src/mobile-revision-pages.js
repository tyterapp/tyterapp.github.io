import { useEffect, useRef } from "react";
import { canonicalScreenplayPages } from "./canonical-pages.js";
import { pageRevisionColors } from "./script-revisions.js";
import { pageVersionBreaks } from "./page-versions.js";

export function useMobileRevisionPages(
  editor,
  enabled,
  onPages,
  fontSize,
  fontFamily,
  documentZoom,
  getPageVersions,
) {
  const callback = useRef(onPages);
  callback.current = onPages;
  const versionState = useRef(getPageVersions);
  versionState.current = getPageVersions;
  useEffect(() => {
    if (!editor || !enabled) return;
    let frame,
      timer,
      cachedStarts,
      forcedStarts = [],
      measurementPending = false,
      lastWidth,
      stopped = false;
    const paint = (starts) => {
      if (
        stopped ||
        editor.isDestroyed ||
        editor.view.composing ||
        !editor.view.dom.getClientRects().length
      )
        return;
      const paper = editor.view.dom.closest(".script-paper");
      const rect = paper.getBoundingClientRect(),
        scale = rect.width / paper.offsetWidth || 1;
      const colors = pageRevisionColors(editor.state.doc, starts);
      let previous = 0;
      const tops = starts.map((position, index) => {
        if (!index) return 0;
        const point =
          position + (editor.state.doc.nodeAt(position)?.isBlock ? 1 : 0);
        const top = Math.max(
          previous,
          (editor.view.coordsAtPos(point).top - rect.top) / scale - 8,
        );
        previous = top;
        return top;
      });
      callback.current?.(
        colors.map((version, index) => ({
          version,
          from: starts[index],
          to: starts[index + 1] ?? editor.state.doc.content.size,
          top: tops[index],
          height: Math.max(
            0,
            (tops[index + 1] ?? rect.height / scale) - tops[index],
          ),
        })),
      );
    };
    const measure = () => {
      if (
        stopped ||
        editor.isDestroyed ||
        editor.view.composing ||
        !editor.view.dom.getClientRects().length
      )
        return;
      forcedStarts = pageVersionBreaks(versionState.current?.());
      const pages = canonicalScreenplayPages(editor, fontSize, documentZoom, {
        forcedStarts,
      });
      try {
        cachedStarts = pages.starts;
        paint(cachedStarts);
      } finally {
        pages.dispose();
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      measurementPending = true;
      frame = requestAnimationFrame(() => {
        measurementPending = false;
        measure();
      });
    };
    const repaint = () => {
      // Metadata may arrive between scheduling and executing a resize/idle
      // measurement. A cached repaint must never replace that full refresh.
      if (measurementPending) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => paint(cachedStarts));
    };
    const changed = ({ transaction }) => {
      if (transaction.getMeta("pageVersionLayout")) {
        const nextBreaks = pageVersionBreaks(versionState.current?.());
        if (
          !cachedStarts ||
          JSON.stringify(nextBreaks) !== JSON.stringify(forcedStarts)
        )
          return schedule();
        // Mapped ranges and color updates do not change canonical geometry.
        // In particular, do not cancel the typing idle timer here.
        return repaint();
      }
      if (!transaction.docChanged) return;
      if (!cachedStarts || transaction.getMeta("preventUpdate"))
        return schedule();
      cachedStarts = [
        0,
        ...new Set(
          cachedStarts
            .slice(1)
            .map((position) => transaction.mapping.map(position, 1))
            .filter(
              (position) =>
                position > 0 && position < editor.state.doc.content.size,
            ),
        ),
      ];
      forcedStarts = forcedStarts.map((position) =>
        transaction.mapping.map(position, 1),
      );
      repaint();
      // Keep mobile typing responsive: paint mapped page colours immediately,
      // then refresh the canonical page boundaries after a short typing pause.
      clearTimeout(timer);
      timer = setTimeout(schedule, 160);
    };
    editor.on("transaction", changed);
    editor.view.dom.addEventListener("compositionend", schedule);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== lastWidth) {
        lastWidth = width;
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
      clearTimeout(timer);
      observer.disconnect();
      editor.off("transaction", changed);
      editor.view.dom.removeEventListener("compositionend", schedule);
    };
  }, [editor, enabled, fontSize, fontFamily, documentZoom]);
}
