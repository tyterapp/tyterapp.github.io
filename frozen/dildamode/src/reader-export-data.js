import { screenplayManifest, storyboardManifest } from "./storyboard-export.js";
import { activeComponentUrl } from "./component-url.js";

// Reader files expose only the displayed draft. Do not embed private notes,
// comments, scene alternatives, relationship data or revision history.
export function readerExportData(document) {
  const board = storyboardManifest(document, { images: false });
  const referenced = new Set();
  for (const block of document.content.content)
    for (const part of block.content || [])
      for (const mark of part.marks || [])
        if (mark.type === "entity") referenced.add(mark.attrs?.id);
  const metadata = document.metadata || {};
  const readable = {
    id: document.id,
    title: document.title,
    content: structuredClone(document.content),
    scriptVersion: document.scriptVersion,
    settings: {
      exportSceneNumbers: document.settings?.exportSceneNumbers !== false,
      exportSceneVariants: document.settings?.exportSceneVariants !== false,
    },
    metadata: Object.fromEntries(
      ["author", "year", "email", "fontFamily", "fontSize", "documentZoom"]
        .filter((key) => metadata[key] !== undefined)
        .map((key) => [key, metadata[key]]),
    ),
    components: (document.components || [])
      .filter((component) => referenced.has(component.id))
      .map((component) => ({
        id: component.id,
        name: component.name,
        type: component.type,
        color: component.color,
        url: activeComponentUrl(component),
        urlEnabled: !!activeComponentUrl(component),
      })),
    sceneShots: Object.fromEntries(
      board.scenes.map((scene) => [
        scene.id,
        {
          [scene.variant]: {
            ...scene.settings,
            frames: scene.frames.map((frame) => ({
              id: frame.id,
              durationMs: frame.durationMs,
              transition: frame.transition,
              image: "",
            })),
          },
        },
      ]),
    ),
    ...(document.pageVersions
      ? {
          pageVersions: {
            version: 1,
            mode: "colors",
            pages: document.pageVersions.pages.map((page) => ({
              id: page.id,
              from: page.from,
              to: page.to,
              active: page.active,
              flow: true,
              versions: {},
            })),
          },
        }
      : {}),
  };
  return screenplayManifest(readable);
}

export const readerJSON = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
