import { shotScenes, shotText, updateShotSettings } from "./shot-info.js";
import { sceneRange, sceneLetter } from "./scene-variants.js";
import { rebasePageVersionContent } from "./page-versions.js";
import { storyboardFrames, newFrame } from "./storyboard-data.js";

const paragraph = (format, text = "") => ({
  type: "paragraph",
  attrs: { blockId: crypto.randomUUID(), format },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
export function storyboardScenes(document) {
  const positions = new Map();
  let pos = 0;
  for (const node of document.content?.content || []) {
    positions.set(node.attrs?.blockId, pos);
    pos +=
      2 +
      (node.content || []).reduce((n, part) => n + (part.text?.length || 1), 0);
  }
  return shotScenes(document).map((scene) => {
    const position = positions.get(scene.id) || 0;
    const pages = document.pageVersions?.pages || [];
    let page = pages.findIndex(
      (item) => position >= item.from && position < item.to,
    );
    if (page < 0) page = Math.max(0, pages.length - 1);
    return {
      ...scene,
      page: page + 1,
      color: pages[page]?.active || "white",
      position,
    };
  });
}
function withContent(document, nodes) {
  const content = { type: "doc", content: nodes };
  const next = rebasePageVersionContent(document, content);
  // Keep comment navigation attached to the same block when scenes move.
  let pos = 0;
  const positions = new Map();
  for (const node of nodes) {
    positions.set(node.attrs.blockId, pos + 1);
    pos +=
      2 +
      (node.content || []).reduce((n, part) => n + (part.text?.length || 1), 0);
  }
  const oldPositions = new Map();
  let oldPos = 0;
  for (const node of document.content.content) {
    oldPositions.set(node.attrs.blockId, {
      from: oldPos + 1,
      size: (node.content || []).reduce(
        (n, part) => n + (part.text?.length || 1),
        0,
      ),
    });
    oldPos +=
      2 +
      (node.content || []).reduce((n, part) => n + (part.text?.length || 1), 0);
  }
  return {
    ...next,
    comments: (document.comments || []).map((comment) =>
      positions.has(comment.blockId)
        ? {
            ...comment,
            anchor:
              positions.get(comment.blockId) +
              Math.max(
                0,
                Math.min(
                  oldPositions.get(comment.blockId)?.size || 0,
                  (comment.anchor || 0) -
                    (oldPositions.get(comment.blockId)?.from || 0),
                ),
              ),
          }
        : comment,
    ),
  };
}
export function moveStoryboardScene(document, id, targetId, placement) {
  if (id === targetId) return document;
  const range = sceneRange(document.content, id),
    target = sceneRange(document.content, targetId);
  if (!range || !target) return document;
  const nodes = document.content.content.filter(
    (_, index) => index < range.start || index >= range.end,
  );
  let at = nodes.findIndex((node) => node.attrs?.blockId === targetId);
  if (placement === "after" || (!placement && range.start < target.start)) {
    at++;
    while (at < nodes.length && nodes[at].attrs?.format !== "scene") at++;
  }
  nodes.splice(at, 0, ...range.nodes);
  if (nodes.every((node, index) => node === document.content.content[index]))
    return document;
  return withContent(document, nodes);
}
export function addStoryboardScene(document) {
  const heading = paragraph("scene", "");
  return {
    document: withContent(document, [
      ...document.content.content,
      heading,
      paragraph("action"),
    ]),
    id: heading.attrs.blockId,
  };
}
// Empty scenes start in their first slot; illustrated scenes append new slides.
export function pasteStoryboardImages(document, images, sceneId, letter) {
  if (!images.length) return { document, id: sceneId };
  const range = sceneId && sceneRange(document.content, sceneId);
  if (!range) {
    let next = document,
      id;
    for (const image of images) {
      const added = addStoryboardScene(next);
      id = added.id;
      next = updateShotSettings(added.document, id, "A", {
        frames: [newFrame(image)],
      });
    }
    return { document: next, id };
  }
  if (sceneLetter(range.nodes[0]) !== letter) return { document, id: sceneId };
  const frames = [
    ...storyboardFrames(document.sceneShots?.[sceneId]?.[letter]),
  ];
  const remaining = [...images];
  if (!frames.some((frame) => frame.image))
    for (let index = 0; index < frames.length && remaining.length; index++)
      frames[index] = { ...frames[index], image: remaining.shift() };
  if (frames.length + remaining.length > 200)
    throw new Error("В сцене может быть не больше 200 слайдов.");
  return {
    document: updateShotSettings(document, sceneId, letter, {
      frames: [...frames, ...remaining.map(newFrame)],
    }),
    id: sceneId,
  };
}
export function moveStoryboardFrame(
  document,
  sourceId,
  sourceLetter,
  frameId,
  targetId,
) {
  if (sourceId === targetId) return document;
  const source = sceneRange(document.content, sourceId),
    target = sceneRange(document.content, targetId);
  if (!source || !target || sceneLetter(source.nodes[0]) !== sourceLetter)
    return document;
  const sourceFrames = storyboardFrames(
    document.sceneShots?.[sourceId]?.[sourceLetter],
  );
  const frame = sourceFrames.find((item) => item.id === frameId);
  if (!frame) return document;
  const letter = sceneLetter(target.nodes[0]);
  const targetFrames = storyboardFrames(
    document.sceneShots?.[targetId]?.[letter],
  );
  if (targetFrames.length >= 200)
    throw new Error("В сцене может быть не больше 200 слайдов.");
  const moved = targetFrames.some((item) => item.id === frame.id)
    ? { ...frame, id: crypto.randomUUID() }
    : frame;
  const next = updateShotSettings(document, sourceId, sourceLetter, {
    frames: sourceFrames.filter((item) => item.id !== frameId),
  });
  return updateShotSettings(next, targetId, letter, {
    frames: [...targetFrames, moved],
  });
}
export function changeSceneBlock(document, sceneId, blockId, patch) {
  const range = sceneRange(document.content, sceneId);
  const block = range?.nodes.find((node) => node.attrs.blockId === blockId);
  if (!block) return document;
  const nodes = document.content.content.map((node) => {
    if (node !== block) return node;
    const next = { ...node, attrs: { ...node.attrs } };
    if (patch.format && node !== range.nodes[0])
      next.attrs.format = patch.format;
    if (typeof patch.text === "string" && patch.text !== shotText(node)) {
      // Retain marks on unchanged prefix/suffix, including entity and comment links.
      const old = shotText(node),
        text = patch.text;
      let start = 0,
        end = 0;
      while (
        start < old.length &&
        start < text.length &&
        old[start] === text[start]
      )
        start++;
      while (
        end < old.length - start &&
        end < text.length - start &&
        old[old.length - 1 - end] === text[text.length - 1 - end]
      )
        end++;
      const slice = (from, to) => {
        let offset = 0;
        return (node.content || []).flatMap((part) => {
          const size = part.text?.length || 1,
            a = Math.max(0, from - offset),
            b = Math.min(size, to - offset);
          offset += size;
          return b <= a
            ? []
            : part.type === "text"
              ? [{ ...part, text: part.text.slice(a, b) }]
              : [part];
        });
      };
      const inserted = text
        .slice(start, text.length - end)
        .split("\n")
        .flatMap((line, index) => [
          ...(index ? [{ type: "hardBreak" }] : []),
          ...(line ? [{ type: "text", text: line }] : []),
        ]);
      next.content = [
        ...slice(0, start),
        ...inserted,
        ...slice(old.length - end, old.length),
      ];
    }
    return next;
  });
  return withContent(document, nodes);
}
export function addSceneBlock(document, sceneId, format = "action") {
  const range = sceneRange(document.content, sceneId);
  if (!range) return document;
  const nodes = [...document.content.content];
  nodes.splice(range.end, 0, paragraph(format));
  return withContent(document, nodes);
}
export function removeSceneBlock(document, sceneId, blockId) {
  const range = sceneRange(document.content, sceneId);
  if (!range || range.nodes[0].attrs.blockId === blockId) return document;
  return withContent(
    document,
    document.content.content.filter((node) => node.attrs.blockId !== blockId),
  );
}
export function moveSceneBlock(document, sceneId, id, targetId) {
  const range = sceneRange(document.content, sceneId);
  if (!range || id === targetId || [id, targetId].includes(sceneId))
    return document;
  const blocks = [...range.nodes];
  const from = blocks.findIndex((node) => node.attrs.blockId === id),
    to = blocks.findIndex((node) => node.attrs.blockId === targetId);
  if (from < 1 || to < 1) return document;
  blocks.splice(to, 0, ...blocks.splice(from, 1));
  return withContent(document, [
    ...document.content.content.slice(0, range.start),
    ...blocks,
    ...document.content.content.slice(range.end),
  ]);
}

// One-time import of old ideas, including cards that never had a linked scene.
// Keep the original outline payload too, for lossless TYT round-trips.
export function migrateStoryboard(document) {
  if (document.storyboardVersion === 1) return document;
  let next = document;
  for (const card of document.outline?.cards || []) {
    let id = card.blockId;
    if (!sceneRange(next.content, id)) {
      const heading = paragraph("scene", card.title || "");
      id = heading.attrs.blockId;
      next = withContent(next, [
        ...next.content.content,
        heading,
        paragraph("action", card.text || ""),
      ]);
    }
    const letter = sceneLetter(sceneRange(next.content, id).nodes[0]);
    const act = Math.max(
      1,
      (document.outline?.columns || []).findIndex(
        (column) => column.id === card.columnId,
      ) + 1,
    );
    const existing = next.sceneShots?.[id]?.[letter] || {};
    next = updateShotSettings(next, id, letter, {
      act,
      drama: card.drama ?? 0,
      synopsis: card.text || "",
      ...existing,
    });
  }
  return { ...next, storyboardVersion: 1 };
}
