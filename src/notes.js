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
