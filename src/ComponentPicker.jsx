import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Shapes } from "lucide-react";
import { useLanguage } from "./i18n.js";

export default function ComponentPicker({
  editor,
  components,
  enabled,
  onOpenChange,
}) {
  const language = useLanguage();
  const [popup, setPopup] = useState(null);
  const current = useRef(null),
    config = useRef(null),
    panel = useRef(null);
  current.current = popup;
  config.current = { components, enabled, onOpenChange };
  const close = () => setPopup(null);
  const accept = (component) => {
    const value = current.current;
    if (!value || !editor || editor.isDestroyed || editor.view.composing)
      return;
    if (editor.state.doc.textBetween(value.from, value.to) !== value.text) {
      close();
      return;
    }
    if (component.id !== value.id) {
      const upper =
        ["scene", "character", "transition"].includes(value.format) ||
        value.text === value.text.toLocaleUpperCase();
      const text = upper ? component.name.toLocaleUpperCase() : component.name;
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: value.from, to: value.to },
          {
            type: "text",
            text,
            marks: [
              ...value.marks.filter(
                (mark) => !["entity", "link"].includes(mark.type),
              ),
              {
                type: "entity",
                attrs: {
                  id: component.id,
                  color: component.color || "#827393",
                  automatic: false,
                },
              },
            ],
          },
        )
        .run();
    }
    close();
  };
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    onOpenChange?.(!!popup);
  }, [!!popup, onOpenChange]);
  useEffect(() => {
    if (!enabled) close();
  }, [enabled]);
  useEffect(() => {
    if (!editor) return;
    const click = (event) => {
      close();
      const node = event.target.closest?.("[data-entity-id]");
      if (
        !config.current.enabled ||
        !node ||
        !editor.view.dom.contains(node) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const id = node.dataset.entityId;
      const component = config.current.components.find(
        (item) => item.id === id && item.enabled !== false,
      );
      if (!component) return;
      const pos = editor.view.posAtDOM(node, 0),
        resolved = editor.state.doc.resolve(pos);
      const paragraph = resolved.parent,
        format = paragraph.attrs.format;
      if (component.type === "character" && format === "character") return;
      const ranges = [];
      paragraph.forEach((child, offset) => {
        if (
          !child.isText ||
          !child.marks.some(
            (mark) => mark.type.name === "entity" && mark.attrs.id === id,
          )
        )
          return;
        const from = resolved.start() + offset,
          to = from + child.nodeSize;
        const previous = ranges.at(-1);
        if (previous?.to === from) previous.to = to;
        else
          ranges.push({
            from,
            to,
            marks: child.marks.map((mark) => mark.toJSON()),
          });
      });
      const range = ranges.find((item) => item.from <= pos && item.to > pos);
      if (!range) return;
      const rect = node.getBoundingClientRect();
      const items = config.current.components.filter(
        (item) => item.enabled !== false && item.name?.trim(),
      );
      setPopup({
        ...range,
        id,
        format,
        text: editor.state.doc.textBetween(range.from, range.to),
        items,
        index: Math.max(
          0,
          items.findIndex((item) => item.id === id),
        ),
        left: Math.max(12, Math.min(innerWidth - 272, rect.left)),
        top: Math.max(
          12,
          Math.min(
            innerHeight - Math.min(300, items.length * 40 + 44) - 12,
            rect.bottom + 6,
          ),
        ),
      });
    };
    const outside = (event) => {
      if (
        !panel.current?.contains(event.target) &&
        !event.target.closest?.("[data-entity-id]")
      )
        close();
    };
    const transaction = ({ transaction }) => {
      if (transaction.docChanged) close();
    };
    const key = (event) => {
      const value = current.current;
      if (!value || !editor.isFocused || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (
        !event.altKey &&
        ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Enter") acceptRef.current(value.items[value.index]);
        else
          setPopup(
            (previous) =>
              previous && {
                ...previous,
                index:
                  (previous.index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    previous.items.length) %
                  previous.items.length,
              },
          );
      } else if (!event.ctrlKey && !event.metaKey) close();
    };
    editor.view.dom.addEventListener("click", click);
    editor.on("transaction", transaction);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    const scroll = (event) => {
      if (!panel.current?.contains(event.target)) close();
    };
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      config.current.onOpenChange?.(false);
      editor.view.dom.removeEventListener("click", click);
      editor.off("transaction", transaction);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [editor]);
  useEffect(() => {
    panel.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [popup?.index]);
  if (!popup || !enabled) return null;
  return createPortal(
    <div
      ref={panel}
      className="word-suggestions component-picker"
      role="listbox"
      aria-label={language === "en" ? "Change component" : "Сменить компонент"}
      style={{
        left: popup.left,
        top: popup.top,
        width: Math.min(260, innerWidth - 24),
        maxHeight: Math.min(300, innerHeight - 24),
        overflowY: "auto",
      }}
      onPointerDown={(event) => event.preventDefault()}
    >
      {popup.items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === popup.index}
          className={index === popup.index ? "selected" : ""}
          onClick={() => accept(item)}
        >
          <Shapes size={14} aria-hidden="true" />
          <span className="suggestion-label">{item.name}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
