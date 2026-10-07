export function scrollToText(
  view,
  position,
  frame,
  smooth = true,
  { ensureRoom = false, onComplete } = {},
) {
  if (frame.current !== null) cancelAnimationFrame(frame.current);
  frame.current = requestAnimationFrame(() => {
    frame.current = null;
    if (view.isDestroyed || !view.dom.getClientRects().length) return;
    const scroller = view.dom.closest(".minimal-scroll");
    if (!scroller) {
      view.dispatch(view.state.tr.scrollIntoView());
      onComplete?.();
      return;
    }
    const start = { top: scroller.scrollTop, left: scroller.scrollLeft };
    let revealHorizontally = false;
    const target = () => {
      const rect = view.coordsAtPos(position);
      const viewport = scroller.getBoundingClientRect();
      const footer = scroller
        .closest(".editor-column")
        ?.querySelector(".minimal-footer")
        ?.getBoundingClientRect();
      const top = Math.max(0, viewport.top) + 16;
      const bottom =
        Math.min(
          viewport.top + scroller.clientHeight,
          window.innerHeight,
          footer?.top ?? Infinity,
        ) - 16;
      const aim = top + (bottom - top) * 0.4;
      if (ensureRoom) {
        // Allow even the final scene to sit above the middle of the viewport.
        scroller.style.setProperty(
          "--navigation-bottom-space",
          `${Math.ceil(viewport.top + scroller.clientHeight - aim)}px`,
        );
      }
      const left = Math.max(0, viewport.left) + 24;
      const right =
        Math.min(viewport.left + scroller.clientWidth, window.innerWidth) - 24;
      revealHorizontally ||= rect.left < left || rect.right > right;
      return {
        top: Math.max(
          0,
          Math.min(
            scroller.scrollHeight - scroller.clientHeight,
            scroller.scrollTop + (rect.top + rect.bottom) / 2 - aim,
          ),
        ),
        left: Math.max(
          0,
          Math.min(
            scroller.scrollWidth - scroller.clientWidth,
            revealHorizontally
              ? scroller.scrollLeft + rect.left - left
              : start.left,
          ),
        ),
      };
    };
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const began = performance.now();
    const animate = (now) => {
      frame.current = null;
      if (
        view.isDestroyed ||
        !view.dom.getClientRects().length ||
        position > view.state.doc.content.size
      )
        return;
      // Measure during the transition too: showing the editor can finish
      // pagination or load a font after the first animation frame.
      const destination = target();
      const progress =
        !smooth || reduced ? 1 : Math.min(1, (now - began) / 260);
      const ease = 1 - (1 - progress) ** 3;
      scroller.scrollTop = start.top + (destination.top - start.top) * ease;
      scroller.scrollLeft = start.left + (destination.left - start.left) * ease;
      if (progress < 1) frame.current = requestAnimationFrame(animate);
      else onComplete?.();
    };
    frame.current = requestAnimationFrame(animate);
  });
}
