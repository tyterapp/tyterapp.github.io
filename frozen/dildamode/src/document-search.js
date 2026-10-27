import {
  SCENE_VARIANTS,
  sceneLetter,
  sceneVariantLetters,
} from "./scene-variants.js";
import { SCRIPT_VERSIONS, scriptVersionId } from "./script-versions.js";
import { pageVersionSchema, pageVersionSources } from "./page-versions.js";

export const matchesSearchFormat = (format, filter = "all") =>
  filter === "all" || (format || "action") === filter;

export const searchMatchKey = (match) =>
  match
    ? JSON.stringify([
        match.pageId,
        match.versionId,
        match.sceneId,
        match.variant,
        match.blockId,
        match.localAt ?? match.at,
      ])
    : "";

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

// Scene alternatives are searched in a stable A–F order. The active alternative
// lives in the document; its archived text may be older.
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

function liveMatchPosition(match, blockPositions, sceneLetters) {
  // An inactive scene alternative is not in the assembled document. Its scene
  // heading identifies the page whose alternative must be selected first.
  const hidden =
    match.sceneId && sceneLetters.get(match.sceneId) !== match.variant;
  const position = blockPositions.get(hidden ? match.sceneId : match.blockId);
  return (position ?? 0) + 1 + (hidden ? 0 : match.at);
}

// Search the assembled text once, so a phrase spanning a page boundary is
// found too. Only the current screenplay and its scene alternatives enter
// search; former page copies and historical snapshots never participate.
export function scriptSearchMatches(
  document,
  query,
  format = "all",
  allVersions = false,
) {
  if (!query.trim()) return [];
  const node = pageVersionSchema.nodeFromJSON(document.content);
  const blockPositions = new Map(),
    sceneLetters = new Map();
  node.forEach((block, position) => {
    blockPositions.set(block.attrs.blockId, position);
    if (block.attrs.format === "scene")
      sceneLetters.set(block.attrs.blockId, block.attrs.sceneVariant || "A");
  });
  let selected = pageVersionSources(document);
  // During the first layout pass a new document has no measured page plan yet.
  if (!selected.length)
    selected = [
      {
        pageId: null,
        pageNumber: 1,
        versionId: scriptVersionId(document),
        active: true,
        from: 0,
        to: node.content.size,
        source: document,
      },
    ];
  const liveByPage = new Map(selected.map(({ pageId }) => [pageId, []]));
  for (const match of documentSearchMatches(document, query, format)) {
    const position = liveMatchPosition(match, blockPositions, sceneLetters);
    const page =
      selected.find(({ from, to }) => position >= from && position < to) ||
      selected.at(-1);
    liveByPage.get(page.pageId).push(match);
  }
  const sources = selected;
  return sources.flatMap((entry) => {
    const {
      pageId,
      pageNumber,
      versionId,
      active,
      source,
      firstBlockId,
      firstBlockOffset = 0,
    } = entry;
    const label =
      SCRIPT_VERSIONS.find(({ id }) => id === versionId)?.label ||
      SCRIPT_VERSIONS[0].label;
    const matches = active
      ? liveByPage.get(pageId) || []
      : documentSearchMatches(source, query, format);
    return matches.map((match) => {
      const first = source.content?.content?.[0];
      const hidden = match.sceneId && match.variant !== sceneLetter(first);
      const firstPageBlock = !hidden && match.blockId === firstBlockId;
      const offset = firstPageBlock ? firstBlockOffset : 0;
      return {
        ...match,
        at: match.at + (active ? 0 : offset),
        localAt: match.at - (active ? offset : 0),
        firstPageBlock,
        ...(!active && offset ? { textOffset: offset } : {}),
        pageId,
        pageNumber,
        versionId,
        versionLabel: label,
      };
    });
  });
}
