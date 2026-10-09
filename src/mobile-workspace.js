import { useEffect, useState } from "react";

export const MOBILE_WORKSPACE_QUERY =
  "(min-width: 320px) and (max-width: 831px)";
export const isMobileWorkspace = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.(MOBILE_WORKSPACE_QUERY).matches;
const editable = (node) =>
  node instanceof Element &&
  !!node.closest(
    "input:not([type=range]):not([type=checkbox]), textarea, [contenteditable=true]",
  );

// VisualViewport follows the keyboard on both iOS and Android. Keep layout
// detection separate so a keyboard or pinch gesture cannot switch editions.
export function mobileViewport(viewport, layoutHeight, typing) {
  const scale = viewport?.scale || 1;
  const unzoomed = Math.abs(scale - 1) < 0.05;
  return {
    height: unzoomed ? viewport?.height || layoutHeight : layoutHeight,
    top: unzoomed ? viewport?.offsetTop || 0 : 0,
    keyboard:
      !!typing &&
      unzoomed &&
      layoutHeight - (viewport?.height || layoutHeight) > 120,
  };
}
export function useMobileWorkspace() {
  const [mobile, setMobile] = useState(isMobileWorkspace);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_WORKSPACE_QUERY);
    const changed = () => setMobile(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (!mobile) {
      setKeyboard(false);
      return;
    }
    const root = document.documentElement,
      viewport = window.visualViewport;
    let frame,
      baseline = window.innerHeight;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const typing = editable(document.activeElement);
        if (!typing) baseline = window.innerHeight;
        const metrics = mobileViewport(
          viewport,
          Math.max(baseline, window.innerHeight),
          typing,
        );
        root.style.setProperty("--mobile-height", `${metrics.height}px`);
        root.style.setProperty("--mobile-top", `${metrics.top}px`);
        root.dataset.mobileWorkspace = "true";
        setKeyboard(metrics.keyboard);
        // Only reveal the caret when it actually falls behind the toolbar.
        const selection = window.getSelection();
        if (!selection?.isCollapsed || !selection.rangeCount) return;
        const scroller =
          selection.anchorNode?.parentElement?.closest(".minimal-scroll");
        if (!scroller) return;
        const caret = selection.getRangeAt(0).getBoundingClientRect();
        const visible = scroller.getBoundingClientRect();
        const bottom = visible.bottom - 88;
        if (caret.height && caret.bottom > bottom)
          scroller.scrollTop += caret.bottom - bottom;
        else if (caret.height && caret.top < visible.top + 12)
          scroller.scrollTop -= visible.top + 12 - caret.top;
      });
    };
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    document.addEventListener("selectionchange", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      document.removeEventListener("selectionchange", update);
      root.style.removeProperty("--mobile-height");
      root.style.removeProperty("--mobile-top");
      delete root.dataset.mobileWorkspace;
    };
  }, [mobile]);
  return { mobile, keyboard };
}
