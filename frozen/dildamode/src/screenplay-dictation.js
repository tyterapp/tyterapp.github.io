import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { closeHistory } from "@tiptap/pm/history";

export const dictationPreviewKey = new PluginKey("dictation-preview");
export function dictationPreviewPlugin() {
  return new Plugin({
    key: dictationPreviewKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const next = tr.getMeta(dictationPreviewKey);
        if (next !== undefined) return next;
        if (tr.docChanged && tr.getMeta("preventUpdate")) return null;
        return value ? { ...value, pos: tr.mapping.map(value.pos, -1) } : null;
      },
    },
    props: {
      decorations(state) {
        const value = dictationPreviewKey.getState(state);
        return value
          ? DecorationSet.create(state.doc, [
              Decoration.widget(value.pos, () => value.node, {
                key: value.id,
                side: -1,
                marks: value.marks,
                stopEvent: () => true,
              }),
            ])
          : DecorationSet.empty;
      },
    },
  });
}

// A mapped text bookmark survives unrelated typing while speech is pending.
// Whole-document replacements (versions, history, imports) invalidate it.
export function createDictationTarget(editor, { follow } = {}) {
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
  const preview = document.createElement("span");
  preview.className = "dictation-preview";
  preview.contentEditable = "false";
  preview.setAttribute("aria-hidden", "true");
  const words = document.createElement("span"),
    caret = document.createElement("span");
  caret.className = "dictation-preview-caret";
  preview.append(words, caret);
  const id = crypto.randomUUID();
  const position = () => {
    if (
      !valid ||
      editor.isDestroyed ||
      !editor.isEditable ||
      editor.view.composing
    )
      return null;
    const selection = bookmark.resolve(editor.state.doc);
    return selection.$from.parent.attrs.blockId === blockId ? selection : null;
  };
  const spaced = (selection, text) => {
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
    return {
      prefix:
        left &&
        /\S/u.test(left) &&
        !/[([{«“—-]/u.test(left) &&
        !/^[,.;:!?…)}\]»”]/u.test(text)
          ? " "
          : "",
      suffix:
        right && /\S/u.test(right) && !/^[,.;:!?…)}\]»”]/u.test(right)
          ? " "
          : "",
    };
  };
  return {
    preview(transcript) {
      const selection = position();
      if (!selection) return false;
      const text = String(transcript || "")
        .replace(/\s+/gu, " ")
        .trim();
      const { prefix, suffix } = spaced(selection, text);
      words.textContent = text ? prefix + text + suffix : "";
      editor.view.dispatch(
        editor.state.tr
          .setMeta(dictationPreviewKey, {
            pos: selection.from,
            id,
            node: preview,
            marks,
          })
          .setMeta("addToHistory", false),
      );
      follow?.(editor.view, selection.from, caret);
      return true;
    },
    append(transcript) {
      const selection = position();
      if (!selection) return false;
      const text = String(transcript || "")
        .replace(/\s+/gu, " ")
        .trim();
      if (!text) return true;
      const { from, to } = selection;
      const { prefix, suffix } = spaced(selection, text);
      const tr = closeHistory(editor.state.tr).replaceWith(
        from,
        to,
        editor.schema.text(prefix + text + suffix, marks),
      );
      tr.setSelection(
        TextSelection.create(tr.doc, from + prefix.length + text.length),
      );
      tr.setMeta("dictation", true);
      tr.setMeta(dictationPreviewKey, null);
      editor.view.dispatch(tr);
      bookmark = editor.state.selection.getBookmark();
      editor.view.dispatch(closeHistory(editor.state.tr));
      follow?.(editor.view, editor.state.selection.from);
      return true;
    },
    dispose() {
      valid = false;
      editor.off("transaction", map);
      if (
        !editor.isDestroyed &&
        dictationPreviewKey.getState(editor.state)?.id === id
      )
        editor.view.dispatch(
          editor.state.tr
            .setMeta(dictationPreviewKey, null)
            .setMeta("addToHistory", false),
        );
    },
  };
}
