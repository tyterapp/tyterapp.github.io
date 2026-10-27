import { Decoration } from "@tiptap/pm/view";
import { t } from "./i18n.js";

// These portraits belong to the editor view, not to the screenplay text. One
// portrait identifies the character line, including rich text and aliases.
export function characterThumbnailDecorations(doc, components, onOpen) {
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
      const label = t("Открыть компонент «{0}»", component.name);
      decorations.push(
        Decoration.widget(
          position + 1 + offset,
          () => {
            const anchor = document.createElement(onOpen ? "button" : "span");
            anchor.className = "character-thumbnail-anchor";
            anchor.contentEditable = "false";
            anchor.dataset.entityId = entity.attrs.id;
            if (onOpen) {
              anchor.type = "button";
              anchor.setAttribute("aria-label", label);
              anchor.addEventListener("mousedown", (event) =>
                event.preventDefault(),
              );
              anchor.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpen(entity.attrs.id);
              });
            }
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
            key: `character-thumbnail-${paragraph.attrs.blockId}-${component.key}-${label}`,
            side: -1,
            ignoreSelection: true,
            stopEvent: () => true,
          },
        ),
      );
    });
    return false;
  });
  return decorations;
}
