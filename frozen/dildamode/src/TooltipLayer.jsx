import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const selector =
  "[data-tooltip], .format-bar-button, .selection-toolbar button";

function tooltipTarget(node) {
  if (!(node instanceof Element)) return null;
  const target = node.closest(selector);
  if (!target || target.matches(":disabled")) return null;
  if (
    target.getAttribute("aria-expanded") === "true" ||
    document.querySelector(
      ".minimal-popover, .document-actions-popover, dialog[open]",
    )
  )
    return null;
  const text =
    target.dataset.tooltip ||
    target.querySelector(".format-shortcut, .selection-shortcut")?.textContent;
  return text?.trim() ? { target, text: text.trim() } : null;
}

export default function TooltipLayer() {
  const [active, setActive] = useState(null);
  const [position, setPosition] = useState(null);
  const timer = useRef(null);
  const currentTarget = useRef(null);
  const bubble = useRef(null);

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      currentTarget.current = null;
      setActive(null);
      setPosition(null);
    };
    const show = (item, delay) => {
      if (currentTarget.current === item?.target) return;
      clearTimeout(timer.current);
      currentTarget.current = item?.target || null;
      setActive(null);
      setPosition(null);
      if (!item) return;
      timer.current = setTimeout(() => {
        if (
          currentTarget.current === item.target &&
          item.target.isConnected &&
          tooltipTarget(item.target)
        )
          setActive(item);
      }, delay);
    };
    const over = (event) => show(tooltipTarget(event.target), 220);
    const out = (event) => {
      const next = tooltipTarget(event.relatedTarget);
      if (next?.target !== currentTarget.current) hide();
    };
    const focus = (event) => {
      if (document.documentElement.dataset.keyboardFocus)
        show(tooltipTarget(event.target), 220);
    };
    const blur = (event) => {
      if (
        !event.relatedTarget ||
        tooltipTarget(event.relatedTarget)?.target !== currentTarget.current
      )
        hide();
    };
    const reposition = () => {
      setActive((item) =>
        item && item.target.isConnected ? { ...item } : null,
      );
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, []);

  useLayoutEffect(() => {
    if (!active || !bubble.current) return;
    const anchor = active.target.getBoundingClientRect();
    const box = bubble.current.getBoundingClientRect();
    const below = anchor.top < box.height + 18;
    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - box.width - 8,
        anchor.left + anchor.width / 2 - box.width / 2,
      ),
    );
    const top = below ? anchor.bottom + 10 : anchor.top - box.height - 10;
    const arrow = Math.max(
      10,
      Math.min(box.width - 10, anchor.left + anchor.width / 2 - left),
    );
    setPosition({ left, top, arrow, below });
  }, [active]);

  if (!active) return null;
  return createPortal(
    <div
      ref={bubble}
      className={`unified-tooltip${position?.below ? " below" : ""}`}
      role="tooltip"
      aria-hidden="true"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
        "--tooltip-arrow": `${position?.arrow ?? 10}px`,
      }}
    >
      {active.text}
    </div>,
    document.body,
  );
}
