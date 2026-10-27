// Compare the original quote with its surviving marked text. Deleted text is
// only a display annotation; it must never be inserted into the document.
export function quoteDiff(original = "", current = "") {
  if (original === current)
    return current ? [{ text: current, deleted: false, offset: 0 }] : [];
  const a = original.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];
  const b = current.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];
  // Bound the comparison for very large selections.
  if (a.length * b.length > 1000000)
    return [
      { text: original, deleted: true, offset: 0 },
      { text: current, deleted: false, offset: 0 },
    ].filter((part) => part.text);
  const matrix = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      matrix[i][j] =
        a[i] === b[j]
          ? matrix[i + 1][j + 1] + 1
          : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  const result = [];
  let i = 0,
    j = 0,
    offset = 0;
  const append = (text, deleted) => {
    const last = result.at(-1);
    if (last && last.deleted === deleted) last.text += text;
    else result.push({ text, deleted, offset });
    if (!deleted) offset += text.length;
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      append(b[j++], false);
      i++;
    } else if (
      i < a.length &&
      (j === b.length || matrix[i + 1][j] >= matrix[i][j + 1])
    )
      append(a[i++], true);
    else append(b[j++], false);
  }
  return result;
}

export function commentText(content, id) {
  return (content?.content || [])
    .flatMap((block) => block.content || [])
    .filter((node) =>
      node.marks?.some(
        (mark) => mark.type === "comment" && mark.attrs?.id === id,
      ),
    )
    .map((node) => (node.type === "hardBreak" ? "\n" : node.text || ""))
    .join("");
}
