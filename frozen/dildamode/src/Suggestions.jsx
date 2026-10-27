import { t, useLanguage, getLanguage } from "./i18n.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Shapes, ArrowLeftRight } from "lucide-react";
import { SCENE_TIMES } from "./scene-times.js";
import { componentNameCandidates, componentNames } from "./component-names.js";
import {
  TYPEWRITER_LAYOUT_EVENT,
  typewriterPopupPosition,
} from "./typewriter-popup.js";

const characters = (components) =>
  components.filter(
    (component) =>
      component.enabled !== false &&
      component.type === "character" &&
      component.name?.trim(),
  );

function currentCharacter(editor, components) {
  const { selection } = editor.state;
  if (!selection.empty || selection.$from.parent.attrs.format !== "character")
    return null;
  const line = selection.$from.parent.textContent;
  const leading = line.length - line.trimStart().length;
  const value = line.trimStart();
  for (const component of characters(components))
    for (const name of componentNames(component).sort(
      (a, b) => b.length - a.length,
    )) {
      if (
        value.slice(0, name.length).toLocaleLowerCase() !==
        name.toLocaleLowerCase()
      )
        continue;
      if (!/^\s*(?:\([^)]*\))?\s*$/u.test(value.slice(name.length))) continue;
      const from = selection.$from.start() + leading;
      return {
        component,
        name,
        from,
        to: from + name.length,
        suffix: value.slice(name.length),
      };
    }
  return null;
}
function componentMatches(before, position, format, components) {
  const matches = [];
  const lower = before.toLocaleLowerCase();
  for (const { component, text } of componentNameCandidates(components).sort(
    (a, b) => Number(a.alias) - Number(b.alias),
  )) {
    if (!text) continue;
    const name = text.toLocaleLowerCase();
    for (
      let i = Math.max(0, lower.length - name.length);
      i < lower.length;
      i++
    ) {
      if (i && /[\p{L}\p{M}\p{N}_]/u.test(lower[i - 1])) continue;
      const part = lower.slice(i);
      const enoughInput =
        part.length >= (format === "scene" ? 1 : 2) || /^\p{N}$/u.test(part);
      if (enoughInput && name.startsWith(part)) {
        matches.push({
          text,
          component,
          typedPrefix: before.slice(i),
          from: position - (before.length - i),
          insertLeadingSpace:
            format === "scene" && /[—–-]$/.test(before.slice(0, i)),
        });
        break;
      }
    }
  }
  return matches.slice(0, 3);
}
function mergeSuggestions(components, words) {
  const seen = new Set();
  return [...components, ...words].filter((item) => {
    const key = `${item.from}:${item.text.toLocaleUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function sceneWords(pairs, prefix) {
  const key = prefix.replace(/\s/g, "").toUpperCase();
  const index = getLanguage() === "en" ? 1 : 0;
  return pairs
    .filter((pair) =>
      pair.some((text) => text.replace(/\s/g, "").startsWith(key)),
    )
    .map((pair) => pair[index]);
}
function context(editor, components) {
  if (
    !editor ||
    editor.isDestroyed ||
    !editor.isFocused ||
    editor.view.composing
  )
    return null;
  const { selection } = editor.state;
  if (!selection.empty || selection.$from.parent.type.name !== "paragraph")
    return null;
  const before = selection.$from.parent.textBetween(
    0,
    selection.$from.parentOffset,
    "",
    "\n",
  );
  const after = selection.$from.parent.textBetween(
    selection.$from.parentOffset,
    selection.$from.parent.content.size,
    "",
    "\n",
  );
  const format = selection.$from.parent.attrs.format;
  const existing =
    format === "character" ? currentCharacter(editor, components) : null;
  if (existing) {
    const matches = componentMatches(
      existing.name,
      existing.to,
      format,
      characters(components),
    );
    return {
      prefix: existing.name,
      from: existing.from,
      to: existing.to,
      caretTo: selection.to,
      format,
      currentCharacterId: existing.component.id,
      hasCharacterSuffix: !!existing.suffix,
      components: [
        ...matches,
        {
          action: "change-character",
          text: t("Поменять персонажа"),
          from: existing.from,
        },
      ],
    };
  }
  if (/^[\p{L}\p{M}\p{N}]/u.test(after)) return null;
  const matches = componentMatches(before, selection.from, format, components);
  if (format === "scene") {
    const headings = sceneWords(
      [
        ["ИНТ.", "INT."],
        ["ЭКС.", "EXT."],
        ["ИНТ. / ЭКС.", "INT. / EXT."],
        ["ЭКС. / ИНТ.", "EXT. / INT."],
      ],
      before,
    );
    if (headings.length)
      return {
        prefix: before,
        from: selection.from - before.length,
        to: selection.to,
        format: "scene",
        components: mergeSuggestions(
          matches,
          headings.map((text) => ({
            text,
            from: selection.from - before.length,
          })),
        ),
      };
    // A time of day follows a location and a spaced dash at the end of a heading.
    const ending = before.match(/^.+\s[—–-]\s*([А-ЯЁA-Z]*)$/iu);
    if (ending) {
      const prefix = ending[1];
      const endings = sceneWords(
        SCENE_TIMES.map(([, ru, en]) => [ru, en]),
        prefix,
      );
      if (endings.length)
        return {
          prefix,
          from: selection.from - prefix.length,
          to: selection.to,
          format: "scene",
          insertLeadingSpace: /[—–-]$/.test(
            before.slice(0, before.length - prefix.length),
          ),
          components: mergeSuggestions(
            matches,
            endings.map((text) => ({
              text,
              from: selection.from - prefix.length,
            })),
          ),
        };
    }
  }
  const prefix =
    before.match(/[\p{L}\p{M}\p{N}-]+$/u)?.[0] || matches[0]?.typedPrefix;
  if (!prefix) return null;
  return {
    prefix,
    from: selection.from - prefix.length,
    to: selection.to,
    format,
    components: matches,
  };
}
function matchCase(word, prefix, format) {
  if (
    ["scene", "character", "transition"].includes(format) ||
    prefix === prefix.toLocaleUpperCase()
  )
    return word.toLocaleUpperCase();
  return /^\p{Lu}/u.test(prefix)
    ? word[0].toLocaleUpperCase() + word.slice(1)
    : word;
}
export default function Suggestions({
  editor,
  components = [],
  disabled = false,
}) {
  const language = useLanguage();
  const [popup, setPopup] = useState(null);
  const popupRef = useRef(null),
    config = useRef({
      components,
      disabled,
    }),
    acceptRef = useRef(null),
    scheduleRef = useRef(null);
  config.current = {
    components,
    disabled,
  };
  popupRef.current = popup;
  useEffect(() => {
    if (!editor) return;
    let frame,
      dismissed = null,
      acceptedAt = null,
      replacement = null;
    const key = (c) =>
      `${c.from}:${c.to}:${c.caretTo ?? c.to}:${c.format}:${c.prefix}:${c.mode || "default"}`;
    const signature = (c) =>
      JSON.stringify([
        key(c),
        c.components.map((item) => [
          item.from,
          item.text,
          item.typedPrefix,
          item.insertLeadingSpace,
          item.component?.id,
          item.component?.color,
          item.component?.thumbnail,
          item.action,
        ]),
      ]);
    const position = (items, c) => {
      if (
        !items.length ||
        !editor.isFocused ||
        editor.view.composing ||
        config.current.disabled
      ) {
        setPopup(null);
        return;
      }
      const rect = editor.view.coordsAtPos(c.caretTo ?? c.to),
        viewport = editor.view.dom
          .closest(".minimal-scroll")
          ?.getBoundingClientRect();
      if (
        rect.bottom < (viewport?.top || 55) ||
        rect.top > (viewport?.bottom || window.innerHeight) - 15
      ) {
        setPopup(null);
        return;
      }
      const visual =
        window.innerWidth < 832 &&
        Math.abs((window.visualViewport?.scale || 1) - 1) < 0.05
          ? window.visualViewport
          : null;
      const viewportTop = visual?.offsetTop || 0;
      const viewportBottom =
        viewportTop + (visual?.height || window.innerHeight);
      const width = Math.min(248, window.innerWidth - 24);
      const maxHeight = Math.max(
        74,
        viewportBottom - Math.max(60, viewportTop + 12) - 42,
      );
      const height = Math.min(items.length * 34 + 8, maxHeight);
      const typewriter = typewriterPopupPosition(editor, width);
      setPopup((previous) => {
        const sameContext =
          previous && signature(previous.context) === signature(c);
        const next = {
          items,
          context: c,
          index: sameContext ? previous.index : 0,
          left: Math.max(
            12,
            Math.min(rect.left, window.innerWidth - width - 12),
          ),
          top:
            rect.bottom + height + 8 > viewportBottom - 42
              ? Math.max(60, viewportTop + 12, rect.top - height - 6)
              : rect.bottom + 5,
          width,
          maxHeight,
          ...typewriter,
        };
        return sameContext &&
          previous.left === next.left &&
          previous.top === next.top &&
          previous.width === next.width &&
          previous.maxHeight === next.maxHeight
          ? previous
          : next;
      });
    };
    const refresh = () => {
      let c = config.current.disabled
        ? null
        : context(editor, config.current.components);
      if (replacement && c && key(c) === replacement.key)
        c = {
          ...c,
          mode: "change-character",
          components: characters(config.current.components).map(
            (component) => ({
              text: component.name,
              component,
              from: c.from,
            }),
          ),
        };
      else replacement = null;
      if (!c) {
        dismissed = null;
        acceptedAt = null;
        setPopup(null);
        return;
      }
      if (key(c) === dismissed || (c.caretTo ?? c.to) === acceptedAt) {
        setPopup(null);
        return;
      }
      // Update valid suggestions in place; hiding between contexts causes flicker.
      position(c.components, c);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      // Read the final selection and layout after a transaction/focus burst.
      frame = requestAnimationFrame(refresh);
    };
    scheduleRef.current = schedule;
    const showCharacters = (c) => {
      replacement = { key: key(c) };
      dismissed = null;
      acceptedAt = null;
      const items = characters(config.current.components).map((component) => ({
        text: component.name,
        component,
        from: c.from,
      }));
      position(items, { ...c, mode: "change-character", components: items });
      return true;
    };
    const accept = (item) => {
      const current = popupRef.current;
      if (!current || editor.view.composing) return false;
      let c = context(editor, config.current.components);
      if (c && replacement?.key === key(c))
        c = {
          ...c,
          mode: "change-character",
          components: characters(config.current.components).map(
            (component) => ({ text: component.name, component, from: c.from }),
          ),
        };
      if (!c || signature(c) !== signature(current.context)) {
        setPopup(null);
        return false;
      }
      if (
        item.action === "change-character" ||
        (c.currentCharacterId &&
          c.caretTo < c.to &&
          !c.mode &&
          item.component?.id === c.currentCharacterId)
      )
        return showCharacters(c);
      const text = matchCase(item.text, item.typedPrefix || c.prefix, c.format),
        marks = item.component
          ? [
              {
                type: "entity",
                attrs: {
                  id: item.component.id,
                  color: item.component.color || "#827393",
                },
              },
            ]
          : [];
      const leadingSpace =
        (item.insertLeadingSpace ?? c.insertLeadingSpace) ? " " : "";
      const replacingCharacter =
        c.mode === "change-character" || c.hasCharacterSuffix;
      acceptedAt =
        item.from +
        leadingSpace.length +
        text.length +
        (replacingCharacter ? 0 : 1);
      editor
        .chain()
        .focus()
        .insertContentAt(
          {
            from: item.from,
            to: c.to,
          },
          [
            ...(leadingSpace
              ? [
                  {
                    type: "text",
                    text: leadingSpace,
                    marks: [],
                  },
                ]
              : []),
            {
              type: "text",
              text,
              marks,
            },
            ...(!replacingCharacter
              ? [
                  {
                    type: "text",
                    text: " ",
                    marks: [],
                  },
                ]
              : []),
          ],
        )
        .run();
      setPopup(null);
      replacement = null;
      return true;
    };
    const move = (direction) => {
      setPopup((current) =>
        current
          ? {
              ...current,
              index:
                (current.index + direction + current.items.length) %
                current.items.length,
            }
          : current,
      );
    };
    const original = editor.options.editorProps.handleKeyDown;
    const handler = (view, event) => {
      if (event.isComposing || event.keyCode === 229) return false;
      const current = popupRef.current;
      if (
        current &&
        ["Tab", "Enter"].includes(event.key) &&
        event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        return accept(current.items[current.index]);
      }
      if (current && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "Tab") return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          move(event.key === "ArrowDown" ? 1 : -1);
          return true;
        }
        if (event.key === "Escape") {
          dismissed = key(
            context(editor, config.current.components) || current.context,
          );
          replacement = null;
          setPopup(null);
          return true;
        }
      }
      return original?.(view, event) || false;
    };
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        handleKeyDown: handler,
      },
    });
    const captureShortcut = (event) => {
      const current = popupRef.current;
      // Handle Shift+arrows before the editor or browser extends the text selection.
      if (
        current &&
        !config.current.disabled &&
        editor.isFocused &&
        editor.view.dom.contains(event.target) &&
        !editor.view.composing &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        ["ArrowDown", "ArrowUp"].includes(event.key)
      ) {
        event.preventDefault();
        event.stopPropagation();
        move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key === "Escape") {
        const c =
          current?.context || context(editor, config.current.components);
        if (c) dismissed = key(context(editor, config.current.components) || c);
        cancelAnimationFrame(frame);
        setPopup(null);
        replacement = null;
        return;
      }
      if (
        !editor.isFocused ||
        event.isComposing ||
        !event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        !["Tab", "Enter"].includes(event.key)
      )
        return;
      if (!current && !config.current.disabled) {
        const c = context(editor, config.current.components);
        if (!c?.currentCharacterId) return;
        event.preventDefault();
        event.stopPropagation();
        showCharacters(c);
        return;
      }
      if (!current) return;
      event.preventDefault();
      event.stopPropagation();
      accept(current.items[current.index]);
    };
    document.addEventListener("keydown", captureShortcut, true);
    acceptRef.current = accept;
    const events = ["transaction", "focus", "blur"];
    events.forEach((event) => editor.on(event, schedule));
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener(TYPEWRITER_LAYOUT_EVENT, schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      acceptRef.current = null;
      scheduleRef.current = null;
      events.forEach((event) => editor.off(event, schedule));
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener(TYPEWRITER_LAYOUT_EVENT, schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("keydown", captureShortcut, true);
      if (!editor.isDestroyed)
        editor.setOptions({
          editorProps: {
            ...editor.options.editorProps,
            handleKeyDown: original,
          },
        });
    };
  }, [editor]);
  useEffect(() => {
    scheduleRef.current?.();
  }, [components, disabled, language]);
  useEffect(() => {
    if (popup && !disabled)
      document
        .querySelector('.word-suggestions [aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [popup?.index, popup?.items.length, popup?.maxHeight, disabled]);
  if (!popup || disabled) return null;
  return createPortal(
    <div
      className="word-suggestions"
      role="listbox"
      aria-label={t("Подсказки")}
      style={{
        left: popup.left,
        top: popup.top,
        width: popup.width,
        maxHeight: popup.maxHeight,
        overflowY: "auto",
      }}
      onPointerDown={(e) => e.preventDefault()}
    >
      {popup.items.map((item, i) => (
        <button
          type="button"
          role="option"
          aria-selected={i === popup.index}
          key={`${item.component?.id || "word"}-${item.text}`}
          className={`${i === popup.index ? "selected" : ""}${item.action ? " suggestion-action" : ""}`}
          onClick={() => acceptRef.current?.(item)}
        >
          {popup.context.format === "character" &&
            item.component?.thumbnail && (
              <img
                className="suggestion-thumbnail"
                src={item.component.thumbnail}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            )}
          <span className="suggestion-label">{item.text}</span>
          {i === popup.index && <kbd>Ctrl + Enter</kbd>}
          {item.action && <ArrowLeftRight size={14} aria-hidden="true" />}
          {item.component &&
            !(
              popup.context.format === "character" && item.component.thumbnail
            ) && (
              <Shapes
                className="suggestion-icon"
                size={14}
                aria-label={t("Компонент")}
              />
            )}
        </button>
      ))}
    </div>,
    document.body,
  );
}
