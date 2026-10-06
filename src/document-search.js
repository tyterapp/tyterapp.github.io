export const matchesSearchFormat = (format, filter = "all") =>
  filter === "all" || (format || "action") === filter;

export const searchBlockText = (node) =>
  node.type === "hardBreak"
    ? "\n"
    : node.text || (node.content || []).map(searchBlockText).join("");

export function textSearchRanges(text, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const lower = text.toLocaleLowerCase();
  const ranges = [];
  let at = lower.indexOf(needle);
  while (at !== -1) {
    ranges.push({ at, length: needle.length });
    at = lower.indexOf(needle, at + needle.length);
  }
  return ranges;
}
