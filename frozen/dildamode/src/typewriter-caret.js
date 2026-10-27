import { TextSelection } from "@tiptap/pm/state";

export function typewriterCaret(state) {
  const { $head } = state.selection;
  const text = $head.parent.textBetween(
    0,
    $head.parent.content.size,
    "\n",
    "\n",
  );
  const offset = $head.parentOffset;
  const match = [
    ...text.matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu),
  ].find(
    (item) => item.index <= offset && item.index + item[0].length >= offset,
  );
  const word = match?.[0] || "";
  const from = $head.start() + (match?.index ?? offset);
  const to = from + word.length;
  let linked = false;
  state.doc.nodesBetween(
    word ? from : state.selection.head,
    word ? to : state.selection.head,
    (node) => {
      if (
        node.marks?.some((mark) => ["entity", "link"].includes(mark.type.name))
      )
        linked = true;
    },
  );
  const token =
    text.slice(0, offset).split(/\s/).pop() + text.slice(offset).split(/\s/)[0];
  linked ||= /^(?:https?:\/\/|www\.)\S+/i.test(token);
  return {
    format: $head.parent.attrs.format || "action",
    word,
    language: /[а-яё]/i.test(word) ? "ru" : "en",
    linked,
    from,
    to,
  };
}

export function clampTypewriterPosition({ x, y }, { width, top, bottom }) {
  return {
    x: Math.max(32, Math.min(Math.max(32, width - 32), x)),
    y: Math.max(top, Math.min(bottom, y)),
  };
}

// Move only the selection: dragging the carriage never inserts whitespace or
// records an undo step. DOM focus must not scroll away from the dragged rail.
export function moveTypewriterCaret(editor, x, y, focus = true) {
  const rect = editor.view.dom.getBoundingClientRect();
  const point = editor.view.posAtCoords({
    left: Math.max(rect.left + 1, Math.min(rect.right - 1, x)),
    top: Math.max(rect.top + 1, Math.min(rect.bottom - 1, y)),
  });
  if (!point) return;
  const selection = TextSelection.near(editor.state.doc.resolve(point.pos));
  if (!selection.eq(editor.state.selection))
    editor.view.dispatch(
      editor.state.tr.setSelection(selection).setMeta("addToHistory", false),
    );
  if (focus) editor.view.dom.focus({ preventScroll: true });
}
