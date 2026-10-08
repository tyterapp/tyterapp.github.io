export const SCENE_VARIANTS = ["A", "B", "C", "D", "E", "F"];
export const sceneLetter = (node) =>
  SCENE_VARIANTS.includes(node?.attrs?.sceneVariant)
    ? node.attrs.sceneVariant
    : "A";
export function sceneRange(content, id) {
  const nodes = content?.content || [];
  const start = nodes.findIndex(
    (node) => node.attrs?.format === "scene" && node.attrs.blockId === id,
  );
  if (start < 0) return null;
  let end = start + 1;
  while (end < nodes.length && nodes[end].attrs?.format !== "scene") end++;
  return { start, end, nodes: nodes.slice(start, end) };
}
export function switchSceneVariant(document, id, letter) {
  if (!SCENE_VARIANTS.includes(letter)) return document;
  const range = sceneRange(document.content, id);
  if (!range || sceneLetter(range.nodes[0]) === letter) return document;
  const variants = {
    ...(document.sceneVariants?.[id] || {}),
    [sceneLetter(range.nodes[0])]: structuredClone(range.nodes),
  };
  const exists = !!variants[letter];
  // Unopened variants start from A, rather than inheriting edits made in F
  // (or whichever alternative happens to be active).
  const replacement = structuredClone(
    variants[letter] || variants.A || range.nodes,
  ).map((node, index) => ({
    ...node,
    attrs: {
      ...node.attrs,
      blockId:
        index === 0 ? id : exists ? node.attrs.blockId : crypto.randomUUID(),
      ...(index === 0 ? { sceneVariant: letter } : {}),
    },
  }));
  variants[letter] = structuredClone(replacement);
  return {
    ...document,
    sceneVariants: { ...document.sceneVariants, [id]: variants },
    content: {
      type: "doc",
      content: [
        ...document.content.content.slice(0, range.start),
        ...replacement,
        ...document.content.content.slice(range.end),
      ],
    },
  };
}
export function sceneVariantLetters(document, id, current = "A") {
  return SCENE_VARIANTS.filter(
    (letter) => letter === current || document.sceneVariants?.[id]?.[letter],
  );
}
export function cleanSceneVariants(source, content, sanitize) {
  const result = {};
  let total = 0;
  for (const heading of content.filter(
    (node) => node.attrs.format === "scene",
  )) {
    const id = heading.attrs.blockId;
    const versions = source?.[id];
    if (!versions || typeof versions !== "object") continue;
    const clean = {};
    for (const letter of SCENE_VARIANTS) {
      const blocks = versions[letter];
      if (
        !Array.isArray(blocks) ||
        !blocks.length ||
        blocks.length > 20000 ||
        total + blocks.length > 40000 ||
        blocks[0]?.attrs?.format !== "scene"
      )
        continue;
      try {
        const validated = sanitize(blocks);
        const next = validated.findIndex(
          (node, index) => index > 0 && node.attrs.format === "scene",
        );
        clean[letter] = next < 0 ? validated : validated.slice(0, next);
        clean[letter][0].attrs = {
          ...clean[letter][0].attrs,
          blockId: id,
          sceneVariant: letter,
        };
        total += clean[letter].length;
      } catch {
        /* Ignore malformed inactive versions without losing the active screenplay. */
      }
    }
    if (Object.keys(clean).length) result[id] = clean;
  }
  return result;
}
