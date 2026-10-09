import { Plugin, PluginKey } from "@tiptap/pm/state";
import { textMatchPattern } from "./prop-matches.js";

export const componentLinksKey = new PluginKey("component-links");
export const SKIP_COMPONENT_LINKS = "skip-component-links";

function mergeRanges(ranges) {
  const merged = [];
  for (const range of ranges.sort((a, b) => a.from - b.from || a.to - b.to)) {
    const previous = merged.at(-1);
    if (previous?.to === range.from && previous.mark.eq(range.mark))
      previous.to = range.to;
    else merged.push({ ...range });
  }
  return merged;
}

// Automatic links are derived from whole names; explicit links retain their ownership.
export function componentLinkTransaction(state, components) {
  const type = state.schema.marks.entity;
  if (!type) return null;
  const actual = [],
    desired = [];
  const names = components
    .filter(
      (component) => component.enabled !== false && component.name?.trim(),
    )
    .sort((a, b) => b.name.trim().length - a.name.trim().length)
    .map((component) => ({
      component,
      pattern: textMatchPattern(component.name),
    }));
  state.doc.descendants((paragraph, position) => {
    if (paragraph.type.name !== "paragraph") return;
    const explicit = [],
      occupied = [];
    paragraph.descendants((node, offset) => {
      if (!node.isText) return;
      for (const mark of node.marks.filter((mark) => mark.type === type)) {
        const range = {
          from: position + 1 + offset,
          to: position + 1 + offset + node.nodeSize,
          mark,
        };
        if (mark.attrs.automatic) actual.push(range);
        else explicit.push(range);
      }
    });
    const text = paragraph.textBetween(0, paragraph.content.size, "", "\n");
    for (const { component, pattern } of names) {
      const mark = type.create({
        id: component.id,
        color: component.color || "#8a799a",
        automatic: true,
      });
      for (const match of text.matchAll(pattern)) {
        const from = position + 1 + match.index,
          to = from + match[0].length;
        const overlaps = (range) => range.from < to && range.to > from;
        if (
          occupied.some(overlaps) ||
          explicit.some(
            (range) => overlaps(range) && range.mark.attrs.id !== component.id,
          )
        )
          continue;
        occupied.push({ from, to });
        let cursor = from;
        for (const range of explicit
          .filter(overlaps)
          .sort((a, b) => a.from - b.from)) {
          if (range.from > cursor)
            desired.push({ from: cursor, to: range.from, mark });
          cursor = Math.max(cursor, range.to);
        }
        if (cursor < to) desired.push({ from: cursor, to, mark });
      }
    }
    return false;
  });
  const existing = mergeRanges(actual),
    expected = mergeRanges(desired);
  const key = (range) =>
    JSON.stringify([range.from, range.to, range.mark.attrs]);
  const existingKeys = new Set(existing.map(key)),
    expectedKeys = new Set(expected.map(key));
  const transaction = state.tr;
  for (const range of existing)
    if (!expectedKeys.has(key(range)))
      transaction.removeMark(range.from, range.to, range.mark);
  for (const range of expected)
    if (!existingKeys.has(key(range)))
      transaction.addMark(range.from, range.to, range.mark);
  return transaction.docChanged
    ? transaction
        .setMeta("addToHistory", false)
        .setMeta(SKIP_COMPONENT_LINKS, true)
    : null;
}

export function componentLinksPlugin(getComponents) {
  return new Plugin({
    key: componentLinksKey,
    appendTransaction(transactions, _previous, state) {
      if (
        transactions.some((transaction) =>
          transaction.getMeta(SKIP_COMPONENT_LINKS),
        )
      )
        return null;
      if (
        !transactions.some(
          (transaction) =>
            transaction.docChanged || transaction.getMeta(componentLinksKey),
        )
      )
        return null;
      return componentLinkTransaction(state, getComponents());
    },
  });
}
