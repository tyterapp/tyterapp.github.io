import { SCRIPT_VERSIONS } from "./script-version-colors.js";
import {
  ensurePageVersions,
  syncPageVersions,
  splitPageVersion,
  pageVersionSlice,
} from "./page-versions.js";

// Every alternative is measured separately: its text can have different length,
// formatting and paragraph boundaries from the page currently on screen.
export function preparePageVersionLayout(document, starts, measure) {
  let next = ensurePageVersions(document, starts);
  const legacyPlans = {};
  for (const [id, source] of Object.entries(
    next.pageVersions.legacyVersions || {},
  ))
    if (!next.pageVersions.migratedLegacy?.[id])
      legacyPlans[id] = measure(source.content);
  if (Object.keys(legacyPlans).length)
    next = syncPageVersions(next, starts, { legacyPlans });
  if (next.content !== document.content) return next;
  for (const pageId of next.pageVersions.pages.map((page) => page.id)) {
    const page = next.pageVersions.pages.find((entry) => entry.id === pageId);
    // A fresh physical break inside a stable page means this page overflowed.
    if (!starts.some((from) => from > page.from && from < page.to)) continue;
    const plans = {};
    for (const { id } of SCRIPT_VERSIONS) {
      const entry = pageVersionSlice(next, page.id, id);
      if (entry)
        plans[id] = measure({
          type: "doc",
          content: entry.slice.content.length
            ? entry.slice.content
            : [{ type: "paragraph", attrs: { format: "action" } }],
        });
    }
    const before = next;
    next = splitPageVersion(next, page.id, plans);
    if (next.content !== before.content) return next;
  }
  return next;
}
