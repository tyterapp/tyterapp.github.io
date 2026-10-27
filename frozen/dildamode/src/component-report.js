import { componentNames } from "./component-names.js";
import { textMatches } from "./prop-matches.js";

export function componentReportRows(document) {
  return (document.components || [])
    .filter((item) => item.enabled !== false)
    .map((component) => {
      let scene = null;
      let mentions = 0;
      const scenes = new Set();
      for (const block of document.content?.content || []) {
        const text = (block.content || [])
          .map((part) => part.text || "\n")
          .join("");
        if (block.attrs?.format === "scene") scene = text;
        const matches = new Set(
          componentNames(component).flatMap((name) =>
            textMatches(text, name).map(({ from, to }) => `${from}:${to}`),
          ),
        );
        if (matches.size) {
          mentions += matches.size;
          scenes.add(scene);
        }
      }
      return {
        ...component,
        quantity: component.quantity ?? 1,
        mentions,
        scenes: [...scenes],
      };
    });
}
