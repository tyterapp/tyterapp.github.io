import { SCRIPT_VERSIONS, scriptVersionId } from "./script-versions.js";

const noteId = () =>
  globalThis.crypto?.randomUUID?.() || `note-${Math.random()}`;

export function cleanNotes(value) {
  const content = Array.isArray(value?.content?.content)
    ? value.content.content
    : [];
  return {
    content: {
      type: "doc",
      content: (content.length ? content : [{}]).map((block) => ({
        type: "paragraph",
        attrs: {
          format: "plain",
          blockId:
            typeof block.attrs?.blockId === "string"
              ? block.attrs.blockId
              : globalThis.crypto?.randomUUID?.() || `note-${Math.random()}`,
        },
        ...(Array.isArray(block.content)
          ? {
              content: block.content
                .filter((node) => ["text", "hardBreak"].includes(node.type))
                .map((node) => ({
                  ...node,
                  ...(node.marks
                    ? {
                        marks: node.marks.filter((mark) =>
                          ["entity", "comment"].includes(mark.type),
                        ),
                      }
                    : {}),
                })),
            }
          : {}),
      })),
    },
    comments: Array.isArray(value?.comments)
      ? value.comments.filter(
          (item) =>
            typeof item?.id === "string" && typeof item.text === "string",
        )
      : [],
  };
}

// Older files kept a note in each colour version. Gather their distinct notes
// before dormant snapshots are cleaned, without duplicating copied notes.
export function sharedNotes(source) {
  const active = scriptVersionId(source);
  const candidates = [
    { id: active, notes: source.notes },
    ...SCRIPT_VERSIONS.filter(({ id }) => id !== active).map(({ id }) => ({
      id,
      notes: source.scriptVersions?.[id]?.notes,
    })),
  ];
  const seen = new Set(),
    groups = [];
  for (const candidate of candidates) {
    if (!candidate.notes) continue;
    const notes = cleanNotes(candidate.notes);
    if (
      !notes.comments.length &&
      !notes.content.content.some((block) =>
        block.content?.some(
          (node) => node.type === "hardBreak" || node.text?.length,
        ),
      )
    )
      continue;
    const signature = JSON.stringify({
      blocks: notes.content.content.map((block) => block.content || []),
      comments: notes.comments,
    });
    if (seen.has(signature)) continue;
    seen.add(signature);
    groups.push({ id: candidate.id, notes });
  }
  if (!groups.length)
    return source.notes ? cleanNotes(source.notes) : undefined;
  if (groups.length === 1) return groups[0].notes;

  const content = [],
    comments = [],
    blockIds = new Set(),
    commentIds = new Set();
  let offset = 0;
  for (const group of groups) {
    const heading = {
      type: "paragraph",
      attrs: { format: "plain", blockId: noteId() },
      content: [
        {
          type: "text",
          text: SCRIPT_VERSIONS.find(({ id }) => id === group.id).label,
        },
      ],
    };
    content.push(heading);
    blockIds.add(heading.attrs.blockId);
    offset += 2 + heading.content[0].text.length;
    const blockMap = new Map(),
      commentMap = new Map();
    for (const comment of group.notes.comments) {
      const id = commentIds.has(comment.id) ? noteId() : comment.id;
      commentMap.set(comment.id, id);
      commentIds.add(id);
    }
    const groupOffset = offset;
    for (const original of group.notes.content.content) {
      const block = structuredClone(original);
      const id = blockIds.has(block.attrs.blockId)
        ? noteId()
        : block.attrs.blockId;
      blockMap.set(block.attrs.blockId, id);
      block.attrs.blockId = id;
      blockIds.add(id);
      for (const node of block.content || [])
        for (const mark of node.marks || [])
          if (mark.type === "comment" && commentMap.has(mark.attrs?.id))
            mark.attrs.id = commentMap.get(mark.attrs.id);
      content.push(block);
      offset +=
        2 +
        (block.content || []).reduce(
          (size, node) => size + (node.type === "text" ? node.text.length : 1),
          0,
        );
    }
    comments.push(
      ...group.notes.comments.map((comment) => ({
        ...structuredClone(comment),
        id: commentMap.get(comment.id),
        blockId: blockMap.get(comment.blockId) || comment.blockId,
        anchor: Number.isInteger(comment.anchor)
          ? comment.anchor + groupOffset
          : null,
      })),
    );
  }
  return { content: { type: "doc", content }, comments };
}
