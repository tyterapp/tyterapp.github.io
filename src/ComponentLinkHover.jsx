import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link2 } from "lucide-react";
import { t } from "./i18n.js";
import { activeComponentUrl, componentUrl } from "./component-url.js";

const inside = (point, rect) =>
  point.x >= rect.left &&
  point.x <= rect.right &&
  point.y >= rect.top &&
  point.y <= rect.bottom;
function inTriangle(point, a, b, c) {
  const side = (p, x, y) =>
    (p.x - y.x) * (x.y - y.y) - (x.x - y.x) * (p.y - y.y);
  const values = [side(point, a, b), side(point, b, c), side(point, c, a)];
  return !(values.some((v) => v < 0) && values.some((v) => v > 0));
}
export default function ComponentLinkHover({ editor, components, onEdit }) {
  const [active, setActive] = useState(null);
  const current = useRef(null),
    timer = useRef(null),
    panel = useRef(null),
    exit = useRef(null);
  const address = useRef(null);
  useLayoutEffect(() => {
    if (!active || !address.current) return;
    const rect = address.current.getBoundingClientRect();
    address.current.style.left = `${Math.max(12, Math.min(innerWidth - rect.width - 12, active.left + 22 - rect.width / 2))}px`;
    address.current.style.top = `${active.top - rect.height - 8 >= 8 ? active.top - rect.height - 8 : active.top + 52}px`;
  }, [active]);
  const hide = () => {
    clearTimeout(timer.current);
    current.current = null;
    exit.current = null;
    setActive(null);
  };
  const defer = (delay = 180) => {
    if (!timer.current)
      timer.current = setTimeout(() => {
        timer.current = null;
        hide();
      }, delay);
  };
  const keep = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    if (!editor) return;
    const over = (event) => {
      const node =
        event.target.closest?.("a.script-text-link") ||
        event.target.closest?.("[data-entity-id]");
      if (!node || !editor.view.dom.contains(node)) return;
      const component = components.find(
        (item) => item.id === node.dataset.entityId,
      );
      const url = node.matches("a.script-text-link")
        ? componentUrl(node.getAttribute("href"))
        : activeComponentUrl(component);
      if (!url) return;
      keep();
      exit.current = null;
      // Freeze the anchor for this occurrence, including nested marks and wrapped lines.
      if (current.current?.node === node && current.current.url === url) return;
      const rect =
        Array.from(node.getClientRects()).find(
          (rect) => event.clientY >= rect.top && event.clientY <= rect.bottom,
        ) || node.getBoundingClientRect();
      const viewport = editor.view.dom
        .closest(".minimal-scroll")
        .getBoundingClientRect();
      const value = {
        node,
        id: component?.id,
        name: component?.name || node.textContent,
        url,
        left: Math.max(
          viewport.left + 4,
          Math.min(viewport.right - 48, rect.left + rect.width / 2 - 22),
        ),
        top: rect.top - 50 >= viewport.top ? rect.top - 50 : rect.bottom + 6,
      };
      current.current = value;
      setActive(value);
    };
    const out = (event) => {
      if (
        !current.current ||
        current.current.node.contains(event.relatedTarget)
      )
        return;
      if (event.relatedTarget?.closest?.(".component-link-hover")) {
        keep();
        return;
      }
      exit.current = { x: event.clientX, y: event.clientY };
      defer(350);
    };
    const move = (event) => {
      const anchor = current.current?.node;
      if (!anchor) return;
      if (!anchor.isConnected) {
        hide();
        return;
      }
      if (
        anchor.contains(event.target) ||
        panel.current?.contains(event.target)
      ) {
        keep();
        return;
      }
      if (exit.current && panel.current) {
        const rect = panel.current.getBoundingClientRect(),
          point = { x: event.clientX, y: event.clientY };
        const y = exit.current.y > rect.bottom ? rect.bottom + 4 : rect.top - 4;
        // The safe triangle bridges diagonal motion between text and its action.
        if (
          inside(point, rect) ||
          inTriangle(
            point,
            exit.current,
            { x: rect.left - 8, y },
            { x: rect.right + 8, y },
          )
        ) {
          keep();
          return;
        }
      }
      defer();
    };
    editor.view.dom.addEventListener("pointerover", over);
    editor.view.dom.addEventListener("pointerout", out);
    document.addEventListener("pointermove", move);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      hide();
      editor.view.dom.removeEventListener("pointerover", over);
      editor.view.dom.removeEventListener("pointerout", out);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [editor, components]);
  if (!active) return null;
  return createPortal(
    <div
      ref={panel}
      className="component-link-hover"
      style={{ left: active.left, top: active.top }}
      onPointerEnter={keep}
      onPointerLeave={() => defer()}
    >
      <a
        className="component-hover-link"
        href={active.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("Открыть ссылку: {0}", active.name)}
        aria-describedby="text-link-address"
        onFocus={keep}
        onBlur={hide}
        onClick={(event) => {
          if (active.id && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onEdit?.(active.id);
          }
          hide();
        }}
      >
        <Link2 size={18} aria-hidden="true" />
      </a>
      <span
        ref={address}
        id="text-link-address"
        className="text-link-address"
        role="tooltip"
      >
        {active.url}
      </span>
    </div>,
    document.body,
  );
}
