import { Extension, textInputRule, textPasteRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { createArrowDecorations } from "./arrow-decorations.js";
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
    const decorate = createArrowDecorations();
    return [
      new Plugin({
        key: new PluginKey("arrow-typography"),
        props: {
          decorations(state) {
            return decorate(state.doc);
          },
        },
      }),
    ];
  },
});
