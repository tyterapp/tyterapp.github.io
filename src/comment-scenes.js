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
      for (const block of nodes) {
        const blockId = block.attrs?.blockId;
        if (!blocks.has(blockId)) blocks.set(blockId, reference);
        for (const node of block.content || []) {
          for (const mark of node.marks || []) {
            if (mark.type !== "comment" || !mark.attrs?.id) continue;
            const candidates = marks.get(mark.attrs.id) || [];
            candidates.push({ ...reference, blockId });
            marks.set(mark.attrs.id, candidates);
          }
        }
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
    const candidates = marks.get(comment.id) || [];
    return (
      candidates.find((item) => item.blockId === comment.blockId) ||
      candidates[0] ||
      blocks.get(comment.blockId) ||
      null
    );
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
