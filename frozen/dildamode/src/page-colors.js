import { pageVersionSchema } from "./page-versions.js";
import { SCRIPT_VERSIONS } from "./script-version-colors.js";

const colors = new Set(SCRIPT_VERSIONS.map(({ id }) => id));
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// Keep the selected text of old files. Page colors never own text snapshots.
// The existing field name remains readable by older TYT/export integrations.
export function ensurePageColors(document, starts = [0]) {
  const state = document.pageVersions;
  if (
    state?.mode === "colors" &&
    !Object.keys(document.scriptVersions || {}).length &&
    !Object.keys(state.legacyVersions || {}).length &&
    state.pages.every(
      (page) => page.flow === true && !Object.keys(page.versions || {}).length,
    )
  )
    return document;
  const size = pageVersionSchema.nodeFromJSON(document.content).content.size;
  const existing = (state?.pages || []).filter((page) => page.to > page.from);
  const pages = existing.length
    ? existing.map(({ id, from, to, active }) => ({
        id,
        from,
        to,
        active,
        versions: {},
        flow: true,
      }))
    : [...new Set([0, ...starts])]
        .filter((at) => Number.isInteger(at) && at >= 0 && at < size)
        .sort((a, b) => a - b)
        .map((from, index, cuts) => ({
          id: makeId(),
          from,
          to: cuts[index + 1] ?? size,
          active: colors.has(document.scriptVersion)
            ? document.scriptVersion
            : "white",
          versions: {},
          flow: true,
        }));
  return {
    ...document,
    scriptVersions: {},
    pageVersions: { version: 1, mode: "colors", pages },
  };
}

export function setPageColor(document, pageId, color) {
  if (!colors.has(color)) return document;
  const next = ensurePageColors(document);
  const page = next.pageVersions.pages.find((entry) => entry.id === pageId);
  if (!page || page.active === color) return next;
  return {
    ...next,
    pageVersions: {
      ...next.pageVersions,
      pages: next.pageVersions.pages.map((entry) =>
        entry.id === pageId ? { ...entry, active: color } : entry,
      ),
    },
  };
}

// Colors belong to physical sheets. Natural pagination may grow/shrink their
// ranges; it must never insert hard breaks or restore hidden text.
export function syncPageColors(document, starts) {
  const next = ensurePageColors(document, starts);
  // A text deletion can collapse the first ranges before measurement. Keep
  // their ordinal colors: the remaining first sheet is still the first sheet.
  const old = next.pageVersions.pages;
  const size = pageVersionSchema.nodeFromJSON(next.content).content.size;
  const cuts = [...new Set([0, ...starts])]
    .filter((at) => Number.isInteger(at) && at >= 0 && at < size)
    .sort((a, b) => a - b);
  let active = old[0]?.active || "white";
  const pages = cuts.map((from, index) => {
    const previous = old[index];
    if (previous) active = previous.active;
    const to = cuts[index + 1] ?? size;
    if (previous?.from === from && previous.to === to) return previous;
    return {
      id: previous?.id || makeId(),
      from,
      to,
      active,
      versions: {},
      flow: true,
    };
  });
  if (
    pages.length === old.length &&
    pages.every((page, index) => page === old[index]) &&
    old.length === next.pageVersions.pages.length
  )
    return next;
  return { ...next, pageVersions: { ...next.pageVersions, pages } };
}
