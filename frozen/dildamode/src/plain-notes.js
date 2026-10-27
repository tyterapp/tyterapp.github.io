import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
export const PlainNotes = Extension.create({
  name: "plainNotes",
  priority: 2000,
  addKeyboardShortcuts() {
    return Object.fromEntries(
      [
        "Mod-b",
        "Mod-i",
        "Mod-u",
        ...Array.from({ length: 7 }, (_, index) => `Mod-${index + 1}`),
        "Ctrl-Alt-ArrowLeft",
        "Ctrl-Alt-ArrowRight",
      ].map((key) => [key, () => true]),
    );
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, old, state) {
          if (!transactions.some((transaction) => transaction.docChanged))
            return null;
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (node.type.name === "paragraph" && node.attrs.format !== "plain")
              tr.setNodeMarkup(pos, null, { ...node.attrs, format: "plain" });
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
