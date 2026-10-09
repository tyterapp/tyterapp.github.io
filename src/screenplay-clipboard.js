import { Fragment, Slice } from "@tiptap/pm/model";
import { uid } from "./data.js";

// ProseMirror normally leaves the paragraph edges open for inline insertion.
// A selection covering entire blocks must keep their own screenplay formats.
export function copiedScreenplaySlice(slice, view) {
  const { $from, $to } = view.state.selection;
  const fullStart =
    $from.parent.type.name === "paragraph" && $from.parentOffset === 0;
  const fullEnd =
    $to.parent.type.name === "paragraph" &&
    $to.parentOffset === $to.parent.content.size;
  if (slice.content.childCount === 1 && !(fullStart && fullEnd)) return slice;
  return new Slice(
    slice.content,
    fullStart ? 0 : slice.openStart,
    fullEnd ? 0 : slice.openEnd,
  );
}

export function pastedScreenplaySlice(
  slice,
  components = [],
  view,
  plain = false,
) {
  const selection = view?.state.selection;
  const paragraph = selection?.$from.parent;
  const replacesParagraph =
    paragraph?.type.name === "paragraph" &&
    selection.$to.parent === paragraph &&
    (paragraph.content.size === 0 ||
      (selection.$from.parentOffset === 0 &&
        selection.$to.parentOffset === paragraph.content.size));
  const copiedBlock =
    slice.content.firstChild?.type.name === "paragraph" &&
    !!slice.content.firstChild.attrs.blockId;
  // At an empty line, even a clipped block should use the source format.
  // A fragment inserted inside existing text remains inline.
  const keepBlockFormat = !plain && replacesParagraph && copiedBlock;
  const ids = new Set(components.map((component) => component.id));
  const content = (fragment) => {
    const nodes = [];
    fragment.forEach((node) => {
      const marks = node.marks.filter(
        (mark) =>
          mark.type.name !== "comment" &&
          (mark.type.name !== "entity" || ids.has(mark.attrs.id)),
      );
      if (node.isText) nodes.push(node.mark(marks));
      else
        nodes.push(
          node.type.create(
            node.type.name === "paragraph"
              ? {
                  ...node.attrs,
                  // A duplicate must never steal the original scene's card/variant ID,
                  // including when it is inserted before the original in the document.
                  blockId: uid(),
                  sceneVariant: node.attrs.format === "scene" ? "A" : null,
                }
              : node.attrs,
            content(node.content),
            marks,
          ),
        );
    });
    return Fragment.fromArray(nodes);
  };
  return new Slice(
    content(slice.content),
    keepBlockFormat ? 0 : slice.openStart,
    keepBlockFormat ? 0 : slice.openEnd,
  );
}

export async function copyScreenplaySelection(editor, source) {
  editor.commands.setTextSelection(source);
  const { dom, text } = editor.view.serializeForClipboard(
    editor.state.selection.content(),
  );
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([dom.innerHTML], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      /* The native copy path can work without async clipboard permission. */
    }
  }
  editor.view.focus();
  if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
}
