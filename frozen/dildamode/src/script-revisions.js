import { SCRIPT_VERSIONS } from "./script-version-colors.js";

const ids = new Set(SCRIPT_VERSIONS.map((version) => version.id));
const MAX_ROUND = 1_000_000_000;
export const cleanRevisionRound = (round, version = "white") =>
  Number.isSafeInteger(round) && round >= 0 && round <= MAX_ROUND
    ? round
    : version === "white"
      ? 0
      : 1;
export function cleanRevisionStamp(value) {
  if (
    !value ||
    !ids.has(value.version) ||
    !Number.isSafeInteger(value.round) ||
    value.round < 0 ||
    value.round > MAX_ROUND
  )
    return null;
  return { version: value.version, round: value.round };
}
export const revisionAttributes = (value) => {
  const stamp = cleanRevisionStamp(value);
  return stamp
    ? {
        "data-script-revision-version": stamp.version,
        "data-script-revision-round": stamp.round,
      }
    : {};
};
export const revisionFromElement = (element) =>
  cleanRevisionStamp({
    version: element.getAttribute("data-script-revision-version"),
    round: Number(element.getAttribute("data-script-revision-round")),
  });

// A copy receives a new round even when its colour was used and deleted before.
// Ordering belongs to the branch, rather than to the order of the colour menu.
export function nextRevisionRound(document) {
  let round = 0;
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    const stamp = cleanRevisionStamp(node.attrs?.scriptRevision);
    if (stamp) round = Math.max(round, stamp.round);
    for (const mark of node.marks || []) {
      if (mark.type !== "scriptRevision") continue;
      const value = cleanRevisionStamp(mark.attrs);
      if (value) round = Math.max(round, value.round);
    }
    for (const child of node.content || []) visit(child);
  };
  for (const snapshot of [
    document,
    ...Object.values(document.scriptVersions || {}),
  ]) {
    round = Math.max(round, cleanRevisionRound(snapshot.revisionRound));
    visit(snapshot.content);
    for (const variants of Object.values(snapshot.sceneVariants || {}))
      for (const blocks of Object.values(variants)) blocks.forEach(visit);
  }
  return Math.min(MAX_ROUND, round + 1);
}

export function pageRevisionColors(doc, starts, count = starts.length) {
  const colors = Array(Math.max(1, count)).fill("white");
  const rounds = Array(colors.length).fill(-1);
  const pageAt = (position) => {
    let low = 0,
      high = starts.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (starts[middle] <= position) low = middle + 1;
      else high = middle;
    }
    return Math.max(0, low - 1);
  };
  const apply = (value, from, to) => {
    const stamp = cleanRevisionStamp(value);
    if (!stamp) return;
    const first = pageAt(from),
      last = Math.min(colors.length - 1, pageAt(Math.max(from, to - 1)));
    for (let page = first; page <= last; page++)
      if (stamp.round >= rounds[page]) {
        rounds[page] = stamp.round;
        colors[page] = stamp.version;
      }
  };
  doc.descendants((node, pos) => {
    if (node.isTextblock && !node.content.size)
      apply(node.attrs.scriptRevision, pos + 1, pos + 2);
    if (node.isInline)
      for (const mark of node.marks)
        if (mark.type.name === "scriptRevision")
          apply(mark.attrs, pos, pos + node.nodeSize);
  });
  return colors;
}

export function revisionPageStyle(id) {
  const color =
    SCRIPT_VERSIONS.find((version) => version.id === id) || SCRIPT_VERSIONS[0];
  return {
    "--revision-page-hue": color.hue,
    "--revision-page-chroma": color.chroma,
  };
}
