import { TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";

// A mapped text bookmark survives unrelated typing while speech is pending.
// Whole-document replacements (versions, history, imports) invalidate it.
export function createDictationTarget(editor) {
  if (
    !editor ||
    editor.isDestroyed ||
    !editor.isEditable ||
    editor.view.composing
  )
    return null;
  let bookmark = editor.state.selection.getBookmark(),
    valid = true;
  const blockId = editor.state.selection.$from.parent.attrs.blockId;
  const marks = (
    editor.state.storedMarks || editor.state.selection.$from.marks()
  ).filter((mark) =>
    ["bold", "italic", "underline", "strike"].includes(mark.type.name),
  );
  const map = ({ transaction }) => {
    if (transaction.docChanged && transaction.getMeta("preventUpdate"))
      valid = false;
    if (valid) bookmark = bookmark.map(transaction.mapping);
  };
  editor.on("transaction", map);
  return {
    append(transcript) {
      if (
        !valid ||
        editor.isDestroyed ||
        !editor.isEditable ||
        editor.view.composing
      )
        return false;
      const text = String(transcript || "")
        .replace(/\s+/gu, " ")
        .trim();
      if (!text) return true;
      const selection = bookmark.resolve(editor.state.doc);
      if (selection.$from.parent.attrs.blockId !== blockId) return false;
      const { from, to } = selection;
      const left = selection.$from.parent.textBetween(
        Math.max(0, selection.$from.parentOffset - 1),
        selection.$from.parentOffset,
      );
      const right = selection.$to.parent.textBetween(
        selection.$to.parentOffset,
        Math.min(
          selection.$to.parent.content.size,
          selection.$to.parentOffset + 1,
        ),
      );
      const prefix =
        left &&
        /\S/u.test(left) &&
        !/[([{«“—-]/u.test(left) &&
        !/^[,.;:!?…)}\]»”]/u.test(text)
          ? " "
          : "";
      const suffix =
        right && /\S/u.test(right) && !/^[,.;:!?…)}\]»”]/u.test(right)
          ? " "
          : "";
      const tr = closeHistory(editor.state.tr).replaceWith(
        from,
        to,
        editor.schema.text(prefix + text + suffix, marks),
      );
      tr.setSelection(
        TextSelection.create(tr.doc, from + prefix.length + text.length),
      );
      tr.setMeta("dictation", true);
      editor.view.dispatch(tr);
      bookmark = editor.state.selection.getBookmark();
      editor.view.dispatch(closeHistory(editor.state.tr));
      return true;
    },
    dispose() {
      valid = false;
      editor.off("transaction", map);
    },
  };
}
