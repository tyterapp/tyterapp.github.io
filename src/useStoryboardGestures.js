import { useEffect, useRef } from "react";

export function usePinchGrid(ref, zoom, onZoom) {
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
    element.addEventListener("touchstart", start, { passive: false });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", end);
    return () => {
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", end);
    };
  }, [ref]);
}

// Keep ordinary one-finger scrolling. A stationary long press arms reordering.
export function useLongPressReorder(selector, attribute, onMove) {
  const drag = useRef(null),
    suppress = useRef(false),
    callback = useRef(onMove);
  callback.current = onMove;
  const clear = () => {
    const current = drag.current;
    if (!current) return;
    clearTimeout(current.timer);
    current.element.classList.remove("story-touch-dragging");
    current.targetElement?.classList.remove("story-drop-target");
    if (current.element.hasPointerCapture?.(current.pointerId))
      current.element.releasePointerCapture(current.pointerId);
    drag.current = null;
  };
  useEffect(() => {
    const preventScroll = (event) => {
      if (drag.current?.active) event.preventDefault();
    };
    const cancelPinch = (event) => {
      if (event.touches.length > 1) clear();
    };
    document.addEventListener("touchmove", preventScroll, {
      passive: false,
      capture: true,
    });
    document.addEventListener("touchstart", cancelPinch, {
      passive: true,
      capture: true,
    });
    return () => {
      clear();
      document.removeEventListener("touchmove", preventScroll, true);
      document.removeEventListener("touchstart", cancelPinch, true);
    };
  }, []);
  return {
    onPointerDown(event) {
      suppress.current = false;
      if (
        event.pointerType === "mouse" ||
        event.button !== 0 ||
        !event.isPrimary
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
      };
      current.timer = setTimeout(() => {
        if (drag.current !== current) return;
        current.active = true;
        suppress.current = true;
        current.element.classList.add("story-touch-dragging");
        current.element.setPointerCapture(current.pointerId);
        navigator.vibrate?.(25);
      }, 420);
      drag.current = current;
    },
    onPointerMove(event) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!current.active) {
        if (
          Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8
        )
          clear();
        return;
      }
      event.preventDefault();
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest(selector);
      current.targetElement?.classList.remove("story-drop-target");
      current.targetElement = target;
      current.target = target?.getAttribute(attribute);
      if (current.target && current.target !== current.id)
        target.classList.add("story-drop-target");
    },
    onPointerUp(event) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.active && current.target && current.target !== current.id)
        callback.current(current.id, current.target);
      clear();
    },
    onPointerCancel: clear,
    onContextMenu(event) {
      if (drag.current?.active) event.preventDefault();
    },
    onClickCapture(event) {
      if (!suppress.current) return;
      suppress.current = false;
      if (event.nativeEvent.pointerType === "mouse") return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
