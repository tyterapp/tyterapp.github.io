import {
  SCENE_VARIANTS,
  sceneLetter,
  sceneVariantLetters,
} from "./scene-variants.js";

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

// Read live text for the active version; its cached snapshot may be older.
// Always order versions A–F so switching a search result doesn't reorder results.
export function documentSearchMatches(document, query, format = "all") {
  if (!query.trim()) return [];
  const results = [];
  const add = (blocks, sceneId = null, variant = null, variants = []) => {
    for (const block of blocks) {
      if (!matchesSearchFormat(block.attrs?.format, format)) continue;
      const text = searchBlockText(block);
      for (const range of textSearchRanges(text, query))
        results.push({
          text,
          ...range,
          blockId: block.attrs?.blockId,
          sceneId,
          variant,
          variants,
          format: block.attrs?.format || "action",
        });
    }
  };
  const blocks = document.content?.content || [];
  for (let i = 0; i < blocks.length;) {
    const block = blocks[i];
    if (block.attrs?.format !== "scene") {
      add([block]);
      i++;
      continue;
    }
    const id = block.attrs.blockId,
      active = sceneLetter(block);
    let end = i + 1;
    while (end < blocks.length && blocks[end].attrs?.format !== "scene") end++;
    const activeBlocks = blocks.slice(i, end);
    const letters = sceneVariantLetters(document, id, active);
    for (const letter of SCENE_VARIANTS) {
      const version =
        letter === active
          ? activeBlocks
          : document.sceneVariants?.[id]?.[letter];
      if (version) add(version, id, letter, letters);
    }
    i = end;
  }
  return results;
}
