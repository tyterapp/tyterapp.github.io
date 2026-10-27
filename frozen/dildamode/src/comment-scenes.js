import { SCENE_VARIANTS, sceneLetter } from "./scene-variants.js";

// Active text is authoritative; its cached version may still contain older edits.
export function commentSceneIndex(document) {
  const scenes = new Map(),
    marks = new Map(),
    blocks = new Map();
  let active = null;
  for (const block of document.content?.content || []) {
    if (block.attrs?.format === "scene") {
      active = {
        sceneId: block.attrs.blockId,
        variant: sceneLetter(block),
        number: scenes.size + 1,
        blocks: [],
      };
      scenes.set(active.sceneId, active);
    }
    if (active) active.blocks.push(block);
  }
  for (const scene of scenes.values()) {
    for (const variant of SCENE_VARIANTS) {
      const nodes =
        variant === scene.variant
          ? scene.blocks
          : document.sceneVariants?.[scene.sceneId]?.[variant];
      if (!nodes) continue;
      const reference = {
        sceneId: scene.sceneId,
        variant,
        number: scene.number,
      };
      const marked = new Map();
      for (const block of nodes) {
        const blockId = block.attrs?.blockId;
        const candidates = blocks.get(blockId) || [];
        candidates.push({
          ...reference,
          text: (block.content || [])
            .map((node) => (node.type === "hardBreak" ? "\n" : node.text || ""))
            .join(""),
        });
        blocks.set(blockId, candidates);
        for (const node of block.content || []) {
          for (const mark of node.marks || []) {
            if (mark.type !== "comment" || !mark.attrs?.id) continue;
            const candidate = marked.get(mark.attrs.id) || {
              ...reference,
              blockIds: new Set(),
              text: "",
            };
            if (candidate.blockIds.size && !candidate.blockIds.has(blockId))
              candidate.text += "\n";
            candidate.blockIds.add(blockId);
            candidate.text += node.text || "";
            marked.set(mark.attrs.id, candidate);
          }
        }
      }
      for (const [id, candidate] of marked) {
        const candidates = marks.get(id) || [];
        candidates.push(candidate);
        marks.set(id, candidates);
      }
    }
  }
  return (comment) => {
    const scene = scenes.get(comment.sceneId);
    if (scene && SCENE_VARIANTS.includes(comment.sceneVariant)) {
      return {
        sceneId: scene.sceneId,
        variant: comment.sceneVariant,
        number: scene.number,
      };
    }
    const normalize = (text) => text.replace(/\s+/g, " ").trim();
    const quote = normalize(comment.quote || "");
    const marked = marks.get(comment.id) || [],
      paragraphs = blocks.get(comment.blockId) || [];
    const matching = (candidates) =>
      quote
        ? candidates.filter((item) => normalize(item.text).includes(quote))
        : [];
    const matchingMarks = matching(marked),
      matchingParagraphs = matching(paragraphs);
    const eligible = matchingMarks.length
      ? matchingMarks
      : matchingParagraphs.length
        ? matchingParagraphs
        : marked.length
          ? marked
          : paragraphs;
    const reference =
      eligible.find((item) => item.blockIds?.has(comment.blockId)) ||
      eligible[0];
    return reference
      ? {
          sceneId: reference.sceneId,
          variant: reference.variant,
          number: reference.number,
        }
      : null;
  };
}

export function activeSceneForBlock(document, blockId) {
  let scene = null;
  for (const block of document.content?.content || []) {
    if (block.attrs?.format === "scene")
      scene = {
        sceneId: block.attrs.blockId,
        sceneVariant: sceneLetter(block),
      };
    if (block.attrs?.blockId === blockId) return scene;
  }
  return null;
}
