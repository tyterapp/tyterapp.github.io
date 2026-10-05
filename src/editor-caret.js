import { TextSelection } from "@tiptap/pm/state";

const STORAGE_PREFIX = "tyter.caret.v1:";

// Paragraph IDs keep a cursor attached to its text when scenes are added before it.
export function captureCaret({ doc, selection }) {
  const point = (position) => {
    const resolved = doc.resolve(position);
    for (let depth = resolved.depth; depth > 0; depth--)
      if (resolved.node(depth).isTextblock)
        return {
          blockId: resolved.node(depth).attrs.blockId,
          index: resolved.index(0),
          offset: position - resolved.start(depth),
          position,
        };
    return { position };
  };
  return { anchor: point(selection.anchor), head: point(selection.head) };
}

export function selectionAtCaret(doc, caret) {
  const blocks = [];
  doc.descendants((node, at) => {
    if (!node.isTextblock) return;
    blocks.push({ node, at });
    return false;
  });
  const position = (point) => {
    const block =
      (point?.blockId &&
        blocks.find(({ node }) => node.attrs.blockId === point.blockId)) ||
      (Number.isInteger(point?.index) &&
        blocks[Math.max(0, Math.min(point.index, blocks.length - 1))]);
    if (block && Number.isInteger(point?.offset))
      return (
        block.at +
        1 +
        Math.max(0, Math.min(point.offset, block.node.content.size))
      );
    return Math.max(0, Math.min(point?.position || 1, doc.content.size));
  };
  return TextSelection.between(
    doc.resolve(position(caret?.anchor)),
    doc.resolve(position(caret?.head)),
  );
}

export function readCaret(documentId) {
  if (!documentId) return null;
  try {
    const caret = JSON.parse(localStorage.getItem(STORAGE_PREFIX + documentId));
    return Number.isInteger(caret?.anchor?.position) &&
      Number.isInteger(caret?.head?.position)
      ? caret
      : null;
  } catch {
    return null;
  }
}

export function writeCaret(documentId, caret) {
  if (!documentId) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + documentId, JSON.stringify(caret));
  } catch {
    // Editing remains available when browser storage is full or disabled.
  }
}
