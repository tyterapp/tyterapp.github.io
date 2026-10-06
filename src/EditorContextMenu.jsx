import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sourceForRange, nativeSelectedSource } from "./SelectionToolbar.jsx";
export default function EditorContextMenu({
  editor,
  onCreateComponent,
  onCreateProp,
  onOpenChange,
}) {
  const language = useLanguage();
  const [menu, setMenu] = useState(null),
    [clipboard, setClipboard] = useState(""),
    [spelling, setSpelling] = useState(null),
    [error, setError] = useState("");
  const menuRef = useRef(null),
    worker = useRef(null),
    request = useRef(0);
  const handlers = useRef({
    onCreateComponent,
    onCreateProp,
    onOpenChange,
  });
  handlers.current = {
    onCreateComponent,
    onCreateProp,
    onOpenChange,
  };
  useEffect(() => {
    if (!editor) return;
    const currentSource = () =>
      nativeSelectedSource(editor) ||
      sourceForRange(
        editor,
        editor.state.selection.from,
        editor.state.selection.to,
      );
    const nativeAction = (action) => {
      const source = currentSource();
      if (!source) return;
      if (action === "component") handlers.current.onCreateComponent?.(source);
      else if (action === "prop") handlers.current.onCreateProp?.(source);
      else
        editor
          .chain()
          .focus()
          .setTextSelection(source)
          [action === "bold" ? "toggleBold" : "toggleItalic"]()
          .run();
    };
    const unsubscribe = window.tyterDesktop?.onEditorAction?.(nativeAction);
    if (window.tyterDesktop) return unsubscribe;
    const open = (event) => {
      event.preventDefault();
      const source = currentSource();
      const point = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      const pos = Math.min(
        editor.state.doc.content.size,
        Math.max(0, point?.pos || editor.state.selection.from),
      );
      const resolved = editor.state.doc.resolve(pos);
      const text = resolved.parent.textContent;
      const offset = resolved.parentOffset;
      const before = text.slice(0, offset).match(/[а-яё]+$/i)?.[0] || "";
      const after = text.slice(offset).match(/^[а-яё]+/i)?.[0] || "";
      const word = source?.text.match(/^[а-яё]+$/i)
        ? source.text
        : before + after;
      const wordRange =
        source?.text === word
          ? source
          : {
              from: pos - before.length,
              to: pos + after.length,
            };
      const id = ++request.current;
      setMenu({
        source,
        pos,
        word,
        wordRange,
        x: Math.max(8, Math.min(event.clientX, innerWidth - 292)),
        y: event.clientY,
        id,
      });
      setSpelling(null);
      setClipboard("");
      setError("");
      handlers.current.onOpenChange?.(true);
      navigator.clipboard
        ?.readText()
        .then((value) => {
          if (request.current === id) setClipboard(value);
        })
        .catch(() => {});
      if (word.length > 1) {
        if (!worker.current) {
          worker.current = new Worker(
            new URL("./dictionary.worker.js", import.meta.url),
            {
              type: "module",
            },
          );
          worker.current.onmessage = ({ data }) => {
            if (data.id === request.current && data.type === "spelling")
              setSpelling(data);
          };
        }
        worker.current.postMessage({
          type: "spell",
          word,
          id,
        });
      }
    };
    editor.view.dom.addEventListener("contextmenu", open);
    return () => {
      editor.view.dom.removeEventListener("contextmenu", open);
      unsubscribe?.();
      worker.current?.terminate();
      worker.current = null;
    };
  }, [editor]);
  const close = () => {
    request.current++;
    setMenu(null);
    handlers.current.onOpenChange?.(false);
  };
  useEffect(() => {
    if (!menu) return;
    const rect = menuRef.current.getBoundingClientRect();
    menuRef.current.style.top = `${Math.max(8, Math.min(menu.y, innerHeight - rect.height - 8))}px`;
    const outside = (event) => {
      if (!menuRef.current?.contains(event.target)) close();
    };
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const buttons = [
          ...menuRef.current.querySelectorAll("button:not(:disabled)"),
        ];
        const current = buttons.indexOf(document.activeElement);
        buttons[
          (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length
        ]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener("resize", close);
    };
  }, [menu, spelling, error]);
  if (!menu) return null;
  const selected = !!menu.source;
  const perform = async (action) => {
    const source = menu.source;
    try {
      if (action === "copy" || action === "cut") {
        await navigator.clipboard.writeText(source.text);
        if (action === "cut") editor.chain().focus().deleteRange(source).run();
      } else if (action === "paste") {
        const lines = clipboard.replace(/\r/g, "").split("\n");
        const content =
          lines.length === 1
            ? {
                type: "text",
                text: lines[0],
              }
            : lines.map((text) => ({
                type: "paragraph",
                attrs: {
                  format: "action",
                },
                ...(text
                  ? {
                      content: [
                        {
                          type: "text",
                          text,
                        },
                      ],
                    }
                  : {}),
              }));
        editor
          .chain()
          .focus()
          .setTextSelection(source || menu.pos)
          .insertContent(content)
          .run();
      } else if (action === "all") editor.chain().focus().selectAll().run();
      else if (action === "component")
        handlers.current.onCreateComponent?.(source);
      else if (action === "prop") handlers.current.onCreateProp?.(source);
      else
        editor
          .chain()
          .focus()
          .setTextSelection(source)
          [action === "bold" ? "toggleBold" : "toggleItalic"]()
          .run();
      close();
    } catch {
      setError(
        "Разрешите браузеру доступ к буферу обмена или используйте Ctrl+C / Ctrl+V.",
      );
    }
  };
  return createPortal(
    <div
      ref={menuRef}
      className="editor-context-menu"
      role="menu"
      aria-label={t("Действия с текстом")}
      style={{
        left: menu.x,
        top: menu.y,
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {[
        ["paste", t("Вставить"), !!clipboard],
        ["copy", t("Копировать"), selected],
        ["cut", t("Вырезать"), selected],
        ["all", t("Выделить всё"), true],
        ["bold", t("Жирный"), selected],
        ["italic", t("Курсив"), selected],
        ["component", t("Компонент"), selected],
        ["prop", t("Реквизит"), selected],
      ].map(([action, label, enabled], index) => (
        <button
          role="menuitem"
          key={action}
          disabled={!enabled}
          className={index === 4 ? "context-section-start" : ""}
          onClick={() => perform(action)}
        >
          {t(label)}
          <small>
            {
              {
                paste: "Ctrl+V",
                copy: "Ctrl+C",
                cut: "Ctrl+X",
                all: "Ctrl+A",
                bold: "Ctrl+B",
                italic: "Ctrl+I",
                component: "Ctrl+D",
                prop: "Ctrl+E",
              }[action]
            }
          </small>
        </button>
      ))}
      <div className="context-spelling-heading">
        {t("Орфография · русский")}
      </div>
      {menu.word ? (
        spelling ? (
          spelling.correct ? (
            <p>{t("Слово есть в словаре")}</p>
          ) : spelling.words.length ? (
            spelling.words.map((word) => (
              <button
                role="menuitem"
                key={word}
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .insertContentAt(menu.wordRange, {
                      type: "text",
                      text: /^[А-ЯЁ]/.test(menu.word)
                        ? word[0].toLocaleUpperCase("ru") + word.slice(1)
                        : word,
                    })
                    .run();
                  close();
                }}
              >
                {word}
              </button>
            ))
          ) : (
            <p>{t("Нет вариантов замены")}</p>
          )
        ) : (
          <p>{t("Проверяем слово…")}</p>
        )
      ) : (
        <p>{t("Нажмите на слово для проверки")}</p>
      )}
      {error && <p role="status">{t(error)}</p>}
    </div>,
    document.body,
  );
}
