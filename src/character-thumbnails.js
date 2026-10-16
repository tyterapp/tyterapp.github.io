import { Decoration } from "@tiptap/pm/view";

// These portraits belong to the editor view, not to the screenplay text. One
// portrait identifies the character line, including rich text and aliases.
export function characterThumbnailDecorations(doc, components) {
  const decorations = [];
  if (!components.size) return decorations;
  doc.descendants((paragraph, position) => {
    if (paragraph.type.name !== "paragraph") return;
    if (paragraph.attrs.format !== "character") return false;
    let illustrated = false;
    paragraph.descendants((node, offset) => {
      if (illustrated || !node.isText) return;
      const entity = node.marks.find((mark) => mark.type.name === "entity");
      const component = components.get(entity?.attrs.id);
      if (!component) return;
      illustrated = true;
      decorations.push(
        Decoration.widget(
          position + 1 + offset,
          () => {
            const anchor = document.createElement("span");
            anchor.className = "character-thumbnail-anchor";
            anchor.contentEditable = "false";
            anchor.dataset.entityId = entity.attrs.id;
            const image = document.createElement("img");
            image.className = "character-thumbnail";
            image.src = component.thumbnail;
            image.alt = "";
            image.draggable = false;
            image.setAttribute("aria-hidden", "true");
            anchor.append(image);
            return anchor;
          },
          {
            key: `character-thumbnail-${paragraph.attrs.blockId}-${component.key}`,
            side: -1,
            ignoreSelection: true,
          },
        ),
      );
    });
    return false;
  });
  return decorations;
}
