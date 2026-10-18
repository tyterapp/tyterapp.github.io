import {
  ensurePageVersions,
  syncPageVersions,
  pageVersionSchema,
} from "./page-versions.js";

function groupsFor(pages, released) {
  const groups = [];
  for (const page of pages) {
    if (!groups.length || (page.flow !== true && !released.has(page.id)))
      groups.push([]);
    groups.at(-1).push(page);
  }
  return groups;
}

// Reconcile the live text only. Inactive page copies belong to their page,
// and must not be copied/split merely because a different copy overflowed.
export function reflowPageVersions(document, starts, measure) {
  const all = document.pageVersions.pages;
  const pages = all.filter((page) => page.to > page.from);
  if (!pages.length) return document;
  const size = pageVersionSchema.nodeFromJSON(document.content).content.size;
  let cuts = [...new Set([0, ...starts])]
    .filter((at) => Number.isInteger(at) && at >= 0 && at < size)
    .sort((a, b) => a - b);
  const released = new Set();
  let groups;
  // Release an existing next page only when overflow reaches it. Later short
  // page copies retain their boundaries until the text actually reaches them.
  for (;;) {
    groups = groupsFor(pages, released);
    const overflowing = groups.findIndex((group, index) => {
      if (index === groups.length - 1) return false;
      const end = groups[index + 1][0].from;
      return (
        cuts.filter((at) => at >= group[0].from && at < end).length >
        group.length
      );
    });
    if (overflowing < 0) break;
    released.add(groups[overflowing + 1][0].id);
    cuts = measure(document.content, {
      forcedStarts: pages
        .slice(1)
        .filter((page) => page.flow !== true && !released.has(page.id))
        .map((page) => page.from),
    });
  }
  const ghosts = new Map();
  let previous = null;
  for (const page of all) {
    if (page.to > page.from) previous = page.id;
    else ghosts.set(previous, [...(ghosts.get(previous) || []), page]);
  }
  const next = (ghosts.get(null) || []).map((page) => ({
    ...page,
    from: 0,
    to: 0,
  }));
  const appendGhosts = (id, at) => {
    for (const page of ghosts.get(id) || [])
      next.push({ ...page, from: at, to: at });
  };
  groups.forEach((group, index) => {
    const end = groups[index + 1]?.[0].from ?? size;
    const froms = cuts.filter((at) => at >= group[0].from && at < end);
    if (froms[0] !== group[0].from) froms.unshift(group[0].from);
    let active = group[0].active;
    froms.forEach((from, part) => {
      const previous = group[part];
      if (previous) active = previous.active;
      const page = {
        ...(previous || { id: crypto.randomUUID(), active, versions: {} }),
        from,
        to: froms[part + 1] ?? end,
        ...(part ? { flow: true } : {}),
      };
      next.push(page);
      if (previous) appendGhosts(previous.id, page.to);
    });
    for (const page of group.slice(froms.length)) {
      next.push({ ...page, from: end, to: end });
      appendGhosts(page.id, end);
    }
  });
  if (
    next.length === all.length &&
    next.every((page, index) => {
      const old = all[index];
      return (
        page.id === old.id &&
        page.from === old.from &&
        page.to === old.to &&
        page.active === old.active &&
        page.versions === old.versions &&
        page.flow === old.flow
      );
    })
  )
    return document;
  return {
    ...document,
    pageVersions: { ...document.pageVersions, pages: next },
  };
}

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
  return reflowPageVersions(next, starts, measure);
}
