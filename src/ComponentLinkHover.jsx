import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link2 } from "lucide-react";
import { t } from "./i18n.js";
import { activeComponentUrl } from "./component-url.js";

export default function ComponentLinkHover({ editor, components, onEdit }) {
  const [active, setActive] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    if (!editor) return;
    const hide = () => setActive(null);
    const over = (event) => {
      const node = event.target.closest?.("[data-entity-id]");
      if (!node || !editor.view.dom.contains(node)) return;
      const component = components.find(
        (item) => item.id === node.dataset.entityId,
      );
      const url = activeComponentUrl(component);
      if (!url) return;
      clearTimeout(timer.current);
      const rect =
        Array.from(node.getClientRects()).find(
          (rect) => event.clientY >= rect.top && event.clientY <= rect.bottom,
        ) || node.getBoundingClientRect();
      const viewport = editor.view.dom
        .closest(".minimal-scroll")
        .getBoundingClientRect();
      setActive({
        id: component.id,
        name: component.name,
        url,
        left: Math.max(
          viewport.left + 4,
          Math.min(viewport.right - 44, rect.left + rect.width / 2 - 20),
        ),
        top: rect.top - 42 >= viewport.top ? rect.top - 42 : rect.bottom + 2,
      });
    };
    const out = (event) => {
      if (event.relatedTarget?.closest?.(".component-hover-link")) return;
      timer.current = setTimeout(hide, 150);
    };
    editor.view.dom.addEventListener("pointerover", over);
    editor.view.dom.addEventListener("pointerout", out);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      clearTimeout(timer.current);
      editor.view.dom.removeEventListener("pointerover", over);
      editor.view.dom.removeEventListener("pointerout", out);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [editor, components]);
  if (
    !active ||
    !components.some(
      (item) =>
        item.id === active.id && activeComponentUrl(item) === active.url,
    )
  )
    return null;
  return createPortal(
    <a
      className="component-hover-link"
      style={{ left: active.left, top: active.top }}
      href={active.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("Открыть ссылку: {0}", active.name)}
      onPointerEnter={() => clearTimeout(timer.current)}
      onPointerLeave={() => {
        timer.current = setTimeout(() => setActive(null), 150);
      }}
      onBlur={() => setActive(null)}
      onClick={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          onEdit?.(active.id);
        }
        setActive(null);
      }}
    >
      <Link2 size={18} aria-hidden="true" />
    </a>,
    document.body,
  );
}
