// Match whole names across adjacent rich-text runs without matching parts of words.
export function textMatchPattern(name) {
  if (!name?.trim()) return null;
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}_])${escaped}(?![\\p{L}\\p{M}\\p{N}_])`,
    "giu",
  );
}
export function textMatches(text, name) {
  const pattern = textMatchPattern(name);
  return pattern
    ? [...text.matchAll(pattern)].map((match) => ({
        from: match.index,
        to: match.index + match[0].length,
      }))
    : [];
}
export function propOccurrences(content, name) {
  return (content?.content || []).reduce(
    (count, block) =>
      count +
      textMatches(
        (block.content || []).map((part) => part.text || "\n").join(""),
        name,
      ).length,
    0,
  );
}
export function propRanges(doc, props) {
  const ranges = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") return;
    const text = node.textBetween(0, node.content.size, "", "\n");
    for (const prop of props)
      for (const match of textMatches(text, prop.name))
        ranges.push({
          from: pos + 1 + match.from,
          to: pos + 1 + match.to,
          prop,
        });
    return false;
  });
  return ranges;
}
