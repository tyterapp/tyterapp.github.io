import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bold,
  Italic,
  Underline,
  Box,
  Shapes,
  MessageSquarePlus,
} from "lucide-react";
import "./selection-toolbar.css";
export function sourceForRange(editor, from, to) {
  if (!editor || editor.isDestroyed) return null;
  const { doc } = editor.state;
  if (from === to) return null;
  const text = doc.textBetween(from, to, "\n");
  if (!text.trim()) return null;
  let paragraph = null;
  const entityIds = new Set();
  doc.nodesBetween(from, to, (node) => {
    if (node.isText)
      node.marks
        .filter((mark) => mark.type.name === "entity")
        .forEach((mark) => entityIds.add(mark.attrs.id));
  });
  const start = doc.resolve(from);
  for (let depth = start.depth; depth > 0; depth -= 1) {
    if (start.node(depth).type.name === "paragraph") {
      paragraph = start.node(depth);
      break;
    }
  }
  return {
    from,
    to,
    text,
    blockId: paragraph?.attrs.blockId || null,
    format: paragraph?.attrs.format || "action",
    entityId: entityIds.size === 1 ? [...entityIds][0] : null,
  };
}
function selectedSource(editor) {
  if (!editor || editor.isDestroyed) return null;
  const { selection } = editor.state;
  return sourceForRange(editor, selection.from, selection.to);
}
export function nativeSelectedSource(editor) {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    !editor.view.dom.contains(selection.anchorNode) ||
    !editor.view.dom.contains(selection.focusNode)
  )
    return null;
  try {
    const anchor = editor.view.posAtDOM(
      selection.anchorNode,
      selection.anchorOffset,
    );
    const focus = editor.view.posAtDOM(
      selection.focusNode,
      selection.focusOffset,
    );
    return sourceForRange(
      editor,
      Math.min(anchor, focus),
      Math.max(anchor, focus),
    );
  } catch {
    return null;
  }
}
const sourceKey = (source) =>
  source && `${source.from}:${source.to}:${source.text}`;
const clipsContent = (overflow) => /auto|scroll|hidden|clip/.test(overflow);
function visibleEditorBounds(element) {
  const bounds = {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = window.getComputedStyle(parent);
    if (!clipsContent(style.overflowX) && !clipsContent(style.overflowY))
      continue;
    const rect = parent.getBoundingClientRect();
    if (clipsContent(style.overflowX)) {
      bounds.left = Math.max(bounds.left, rect.left);
      bounds.right = Math.min(bounds.right, rect.right);
    }
    if (clipsContent(style.overflowY)) {
      bounds.top = Math.max(bounds.top, rect.top);
      bounds.bottom = Math.min(bounds.bottom, rect.bottom);
    }
  }
  return bounds;
}
function selectionRect(editor, source, bounds) {
  try {
    // Build the range from the editor state so focusing a toolbar button cannot
    // accidentally replace the selected screenplay text with a browser selection.
    const start = editor.view.domAtPos(source.from);
    const end = editor.view.domAtPos(source.to);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const visibleRects = Array.from(range.getClientRects()).filter(
      (rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > bounds.top &&
        rect.top < bounds.bottom &&
        rect.right > bounds.left &&
        rect.left < bounds.right,
    );
    return visibleRects.at(-1) || null;
  } catch {
    return null;
  }
}
export default function SelectionToolbar({
  editor,
  onCreateComponent,
  onCreateProp,
  onComment,
  disabled = false,
  minimal = false,
  plainOnly = false,
}) {
  const language = useLanguage();
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "CTRL";
  const toolbarRef = useRef(null);
  const dismissedRef = useRef(null);
  const refreshRef = useRef(null);
  const createComponentRef = useRef(onCreateComponent);
  createComponentRef.current = onCreateComponent;
  const createPropRef = useRef(onCreateProp);
  createPropRef.current = onCreateProp;
  const commentRef = useRef(onComment);
  commentRef.current = onComment;
  const [position, setPosition] = useState(null);
  useEffect(() => {
    if (!editor || editor.isDestroyed || disabled) {
      setPosition(null);
      return;
    }
    let animationFrame = null;
    const update = () => {
      animationFrame = null;
      const source = selectedSource(editor);
      const toolbarFocused = toolbarRef.current?.contains(
        document.activeElement,
      );
      if (!source || (!editor.isFocused && !toolbarFocused)) {
        if (!source) dismissedRef.current = null;
        setPosition(null);
        return;
      }
      if (dismissedRef.current === sourceKey(source)) {
        setPosition(null);
        return;
      }
      const bounds = visibleEditorBounds(editor.view.dom);
      const rect = selectionRect(editor, source, bounds);
      if (
        !rect ||
        bounds.right - bounds.left < 80 ||
        bounds.bottom - bounds.top < 60
      ) {
        setPosition(null);
        return;
      }
      const gap = 8;
      const maxWidth = Math.max(0, bounds.right - bounds.left - gap * 2);
      const toolbarWidth = Math.min(
        toolbarRef.current?.offsetWidth || (minimal ? 243 : 261),
        maxWidth,
      );
      const toolbarHeight = toolbarRef.current?.offsetHeight || 48;
      const center =
        (Math.max(rect.left, bounds.left) +
          Math.min(rect.right, bounds.right)) /
        2;
      const left = Math.max(
        bounds.left + gap,
        Math.min(center - toolbarWidth / 2, bounds.right - toolbarWidth - gap),
      );
      const below = rect.bottom + gap;
      const top = Math.max(
        bounds.top + gap,
        Math.min(
          below + toolbarHeight <= bounds.bottom - gap
            ? below
            : rect.top - toolbarHeight - gap,
          bounds.bottom - toolbarHeight - gap,
        ),
      );
      const next = {
        left: Math.round(left),
        top: Math.round(top),
        maxWidth: Math.round(maxWidth),
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        underline: editor.isActive("underline"),
      };
      setPosition((previous) =>
        previous &&
        Object.keys(next).every((key) => previous[key] === next[key])
          ? previous
          : next,
      );
    };
    const scheduleUpdate = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(update);
    };
    const dismiss = (event) => {
      if (
        toolbarRef.current?.contains(event.target) ||
        editor.view.dom.contains(event.target)
      )
        return;
      dismissedRef.current = sourceKey(selectedSource(editor));
      setPosition(null);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || !toolbarRef.current) return;
      event.preventDefault();
      dismissedRef.current = sourceKey(selectedSource(editor));
      if (toolbarRef.current.contains(document.activeElement))
        editor.commands.focus();
      setPosition(null);
    };
    const onComponentShortcut = (event) => {
      const key = event.key.toLowerCase();
      const createComponent =
        (event.code === "KeyD" || key === "d") && !event.shiftKey;
      const boldAlias =
        (event.code === "KeyB" || key === "b") && event.shiftKey;
      const createProp =
        (event.code === "KeyE" || key === "e") && !event.shiftKey;
      const createComment =
        (event.code === "KeyQ" || key === "q") && !event.shiftKey;
      if (
        !minimal ||
        (!createComponent && !createProp && !createComment && !boldAlias) ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        (!editor.isFocused &&
          !toolbarRef.current?.contains(document.activeElement))
      )
        return;
      if (createComponent || createProp) event.preventDefault();
      const source = nativeSelectedSource(editor) || selectedSource(editor);
      if (!source) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (boldAlias) {
        if (!plainOnly) editor.chain().focus().toggleBold().run();
        return;
      }
      dismissedRef.current = sourceKey(source);
      setPosition(null);
      if (createComment) commentRef.current?.(source);
      else if (createProp) createPropRef.current?.(source);
      else createComponentRef.current?.(source);
    };
    refreshRef.current = scheduleUpdate;
    const editorEvents = ["selectionUpdate", "transaction", "focus", "blur"];
    editorEvents.forEach((event) => editor.on(event, scheduleUpdate));
    const resize = new ResizeObserver(scheduleUpdate);
    resize.observe(editor.view.dom);
    const scroller = editor.view.dom.closest(".minimal-scroll");
    if (scroller) resize.observe(scroller);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", scheduleUpdate);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("keydown", onComponentShortcut, true);
    scheduleUpdate();
    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      refreshRef.current = null;
      resize.disconnect();
      editorEvents.forEach((event) => editor.off(event, scheduleUpdate));
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", scheduleUpdate);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onComponentShortcut, true);
    };
  }, [editor, disabled, minimal, plainOnly]);
  const createFromSelection = (callback) => {
    const source = selectedSource(editor);
    if (!source) return;
    dismissedRef.current = sourceKey(source);
    setPosition(null);
    callback?.(source);
  };
  const toggleFormat = (format) => {
    if (!selectedSource(editor)) return;
    const chain = editor.chain().focus();
    if (format === "bold") chain.toggleBold().run();
    if (format === "italic") chain.toggleItalic().run();
    if (format === "underline") chain.toggleUnderline().run();
  };
  if (!position || disabled || !editor || editor.isDestroyed) return null;
  return createPortal(
    <div
      ref={toolbarRef}
      className={`selection-toolbar${minimal ? " minimal-selection" : ""}`}
      role="toolbar"
      aria-label="Selected text actions"
      style={{
        left: position.left,
        top: position.top,
        maxWidth: position.maxWidth,
      }}
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onFocus={() => refreshRef.current?.()}
      onBlur={() => refreshRef.current?.()}
    >
      {
        <>
          {!plainOnly && (
            <>
              {[
                {
                  name: minimal ? t("Жирный") : "Bold",
                  mark: "bold",
                  Icon: Bold,
                  key: "B",
                },
                {
                  name: minimal ? t("Курсив") : "Italic",
                  mark: "italic",
                  Icon: Italic,
                  key: "I",
                },
                {
                  name: minimal ? t("Подчёркнутый") : "Underline",
                  mark: "underline",
                  Icon: Underline,
                  key: "U",
                },
              ].map(({ name, mark, Icon, key }) => (
                <button
                  key={mark}
                  type="button"
                  aria-label={t(name)}
                  aria-describedby={`selection-tip-${mark}`}
                  aria-keyshortcuts={`Control+${key.replace("SHIFT + ", "Shift+")} Meta+${key.replace("SHIFT + ", "Shift+")}`}
                  aria-pressed={position[mark]}
                  onClick={() => toggleFormat(mark)}
                >
                  <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                  <span
                    className="selection-shortcut"
                    role="tooltip"
                    id={`selection-tip-${mark}`}
                  >
                    {shortcut} + {key}
                  </span>
                </button>
              ))}
              <span className="selection-toolbar-divider" aria-hidden="true" />
            </>
          )}
          {!minimal && (
            <button
              type="button"
              aria-label="Add selection to props"
              aria-describedby="selection-tip-prop"
              onClick={() => createFromSelection(onCreateProp)}
            >
              <Box size={21} strokeWidth={1.65} aria-hidden="true" />
              <span
                className="selection-shortcut"
                role="tooltip"
                id="selection-tip-prop"
              >
                Add to props
              </span>
            </button>
          )}
        </>
      }
      <button
        type="button"
        aria-label={
          minimal
            ? t("Создать компонент из выделения")
            : "Create component from selection"
        }
        aria-describedby="selection-tip-component"
        aria-keyshortcuts={minimal ? "Control+D Meta+D" : undefined}
        onClick={() => createFromSelection(onCreateComponent)}
      >
        <Shapes size={21} strokeWidth={1.65} aria-hidden="true" />
        <span
          className="selection-shortcut"
          role="tooltip"
          id="selection-tip-component"
        >
          {minimal ? `${shortcut} + D` : "Create component"}
        </span>
      </button>
      {minimal && (
        <button
          type="button"
          aria-label={t("Создать реквизит из выделения")}
          aria-keyshortcuts="Control+E Meta+E"
          aria-describedby="selection-tip-prop"
          onClick={() => createFromSelection(onCreateProp)}
        >
          <Box size={21} strokeWidth={1.65} aria-hidden="true" />
          <span
            className="selection-shortcut"
            role="tooltip"
            id="selection-tip-prop"
          >
            {t("Реквизит · ")}
            {shortcut} + E
          </span>
        </button>
      )}
      {
        <button
          type="button"
          aria-label={
            minimal ? t("Комментировать выделение") : "Comment on selection"
          }
          aria-describedby="selection-tip-comment"
          aria-keyshortcuts="Control+Q Meta+Q"
          onClick={() => createFromSelection(onComment)}
        >
          <MessageSquarePlus size={21} strokeWidth={1.65} aria-hidden="true" />
          <span
            className="selection-shortcut"
            role="tooltip"
            id="selection-tip-comment"
          >
            {minimal ? t("Комментировать") : "Add comment"}
            {" · "}
            {shortcut} + Q
          </span>
        </button>
      }
    </div>,
    document.body,
  );
}
