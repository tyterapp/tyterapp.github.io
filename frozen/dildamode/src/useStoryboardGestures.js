import { useEffect, useRef } from "react";

export function useStoryboardZoom(ref, zoom, onZoom) {
  const live = useRef({ zoom, onZoom });
  live.current = { zoom, onZoom };
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let pinch = null;
    const distance = (touches) =>
      Math.hypot(
        touches[1].clientX - touches[0].clientX,
        touches[1].clientY - touches[0].clientY,
      );
    const start = (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        pinch = { distance: distance(event.touches), zoom: live.current.zoom };
      }
    };
    const move = (event) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const scale = distance(event.touches) / Math.max(1, pinch.distance);
      live.current.onZoom(
        Math.max(20, Math.min(100, Math.round((pinch.zoom * scale) / 5) * 5)),
      );
    };
    const end = (event) => {
      if (event.touches.length < 2) pinch = null;
    };
    const wheel = (event) => {
      if (!event.ctrlKey || event.defaultPrevented) return;
      // Cancel browser zoom even when the board has reached its zoom limit.
      event.preventDefault();
      if (event.deltaY)
        live.current.onZoom((value) =>
          Math.max(20, Math.min(100, value + (event.deltaY < 0 ? 5 : -5))),
        );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("touchstart", start, { passive: false });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", end);
    return () => {
      element.removeEventListener("wheel", wheel);
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", end);
    };
  }, [ref]);
}

// Keep ordinary one-finger scrolling. A stationary long press arms reordering.
export function useLongPressReorder(
  selector,
  attribute,
  onMove,
  handle,
  targetSelector = selector,
  targetAttribute = attribute,
) {
  const drag = useRef(null),
    suppress = useRef(false),
    callback = useRef(onMove);
  callback.current = onMove;
  const clear = () => {
    const current = drag.current;
    if (!current) return;
    clearTimeout(current.timer);
    cancelAnimationFrame(current.scrollFrame);
    current.element.classList.remove("story-touch-dragging");
    current.ghost?.remove();
    for (const [key, value] of Object.entries(current.style))
      current.element.style[key] = value;
    current.targetElement?.classList.remove("story-drop-target");
    if (current.element.hasPointerCapture?.(current.pointerId))
      current.element.releasePointerCapture(current.pointerId);
    drag.current = null;
  };
  const activate = (current) => {
    if (drag.current !== current) return;
    current.active = true;
    suppress.current = true;
    current.element.classList.add("story-touch-dragging");
    current.element.style.pointerEvents = "none";
    const rect = current.element.getBoundingClientRect();
    current.ghost = current.element.cloneNode(true);
    current.ghost.classList.remove("story-touch-dragging");
    current.ghost.classList.add("story-drag-preview");
    current.ghost.setAttribute("aria-hidden", "true");
    current.ghost.inert = true;
    Object.assign(current.ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
      pointerEvents: "none",
      zIndex: "1000",
      font: getComputedStyle(current.element).font,
    });
    document.body.append(current.ghost);
    current.element.setPointerCapture(current.pointerId);
    if (current.touch) navigator.vibrate?.(25);
    const follow = () => {
      if (drag.current !== current) return;
      const hit = document.elementFromPoint(current.clientX, current.clientY);
      const parent =
        hit?.closest(".story-board-scroll,.story-inspector-scroll") ||
        current.scroller;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        if (current.clientX >= rect.left && current.clientX <= rect.right) {
          if (current.clientY < rect.top + 40) parent.scrollTop -= 10;
          else if (current.clientY > rect.bottom - 40) parent.scrollTop += 10;
        }
      }
      current.ghost.style.transform = `translate(${current.clientX - current.x}px, ${current.clientY - current.y}px)`;
      const target = hit?.closest(targetSelector);
      current.targetElement?.classList.remove("story-drop-target");
      current.targetElement = target;
      current.target = target?.getAttribute(targetAttribute);
      if (current.target && current.target !== current.id)
        target.classList.add("story-drop-target");
      current.ghost.dataset.valid = String(
        !!current.target && current.target !== current.id,
      );
      current.scrollFrame = requestAnimationFrame(follow);
    };
    follow();
  };
  useEffect(() => {
    const preventScroll = (event) => {
      if (drag.current?.active) event.preventDefault();
    };
    const cancelPinch = (event) => {
      if (event.touches.length > 1) clear();
    };
    const move = (event) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      current.clientX = event.clientX;
      current.clientY = event.clientY;
      if (!current.active) {
        if (
          Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6
        )
          return;
        if (current.touch) {
          clear();
          return;
        }
        activate(current);
      }
      event.preventDefault();
    };
    const finish = (event) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest(targetSelector)
        ?.getAttribute(targetAttribute);
      const source = current.id,
        active = current.active;
      clear();
      if (active && target && target !== source)
        callback.current(source, target);
    };
    const escape = (event) => {
      if (event.key === "Escape") clear();
    };
    document.addEventListener("touchmove", preventScroll, {
      passive: false,
      capture: true,
    });
    document.addEventListener("touchstart", cancelPinch, {
      passive: true,
      capture: true,
    });
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", clear);
    document.addEventListener("keydown", escape);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      document.removeEventListener("touchmove", preventScroll, true);
      document.removeEventListener("touchstart", cancelPinch, true);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", clear);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("blur", clear);
    };
  }, []);
  return {
    onPointerDown(event) {
      suppress.current = false;
      if (
        event.button !== 0 ||
        !event.isPrimary ||
        event.target.closest("input,select,textarea") ||
        (handle && !event.target.closest(handle))
      )
        return;
      clear();
      const current = {
        element: event.currentTarget,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        id: event.currentTarget.getAttribute(attribute),
        active: false,
        clientX: event.clientX,
        clientY: event.clientY,
        touch: event.pointerType !== "mouse",
        style: Object.fromEntries(
          ["pointerEvents"].map((key) => [key, event.currentTarget.style[key]]),
        ),
        scroller: event.currentTarget.closest(
          ".story-board-scroll,.story-inspector-scroll",
        ),
      };
      if (current.touch)
        current.timer = setTimeout(() => activate(current), 420);
      drag.current = current;
    },
    onDragStart(event) {
      event.preventDefault();
    },
    onContextMenu(event) {
      if (drag.current?.active) event.preventDefault();
    },
    onClickCapture(event) {
      if (!suppress.current) return;
      suppress.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
