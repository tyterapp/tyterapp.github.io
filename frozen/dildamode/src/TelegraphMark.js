import { Mark, mergeAttributes } from "@tiptap/core";

export const TelegraphMark = Mark.create({
  name: "telegraph",
  inclusive: false,
  parseHTML: () => [{ tag: "span[data-telegraph]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, {
      "data-telegraph": "",
      class: "telegraph-text",
    }),
    0,
  ],
});
