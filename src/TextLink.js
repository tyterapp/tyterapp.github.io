import { Mark } from "@tiptap/core";
import { componentUrl } from "./component-url.js";

// Ordinary links belong to the selected text, independently of components.
export const TextLink = Mark.create({
  name: "link",
  inclusive: false,
  addAttributes() {
    return { href: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: "a[href]",
        getAttrs: (node) => {
          const href = componentUrl(node.getAttribute("href"));
          return href ? { href } : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      {
        href: componentUrl(HTMLAttributes.href) || "",
        class: "script-text-link",
        target: "_blank",
        rel: "noopener noreferrer",
      },
      0,
    ];
  },
});
