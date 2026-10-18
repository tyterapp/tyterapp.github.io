import { selectedPageVersions } from "./page-versions.js";
import { scriptVersion } from "./script-versions.js";

// Export receives the assembled document, but page fragments preserve the
// boundaries and version selected in the editor. Never paginate archived whole
// drafts by the offsets of a different draft.
export function screenplayExportPages(document) {
  const pages = selectedPageVersions(document);
  return {
    explicit: pages.length > 0,
    pages: pages.length
      ? pages
      : [
          {
            id: "legacy",
            pageNumber: 1,
            versionId: scriptVersion(document).id,
            content: document.content,
            openStart: 0,
            openEnd: 0,
          },
        ],
  };
}

export const continuesExportParagraph = (page, previous) =>
  !!(
    previous &&
    page.openStart > 0 &&
    previous.openEnd > 0 &&
    page.content.content[0]?.attrs?.blockId &&
    page.content.content[0].attrs.blockId ===
      previous.content.content.at(-1)?.attrs?.blockId
  );
