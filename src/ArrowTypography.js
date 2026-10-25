import { Extension, textInputRule, textPasteRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { isArrowOnly } from "./arrow-text.js";
import "./arrow-typography.css";

export const ArrowTypography = Extension.create({
  name: "arrowTypography",
  addInputRules() {
    return [
      textInputRule({ find: /->$/, replace: "→" }),
      textInputRule({ find: /<-$/, replace: "←" }),
    ];
  },
  addPasteRules() {
    return [
      textPasteRule({ find: /->/g, replace: "→" }),
      textPasteRule({ find: /<-/g, replace: "←" }),
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("arrow-typography"),
        props: {
          decorations(state) {
            const decorations = [];
            state.doc.descendants((node, pos) => {
              if (node.isTextblock && isArrowOnly(node.textContent))
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "script-arrow-row",
                    style: "text-align:center",
                  }),
                );
              if (node.isText)
                for (const match of node.text.matchAll(/[\u2190-\u21ff]+/gu))
                  decorations.push(
                    Decoration.inline(
                      pos + match.index,
                      pos + match.index + match[0].length,
                      {
                        class: "script-arrow",
                      },
                    ),
                  );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
