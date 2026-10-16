import { Mark } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { isHistoryTransaction } from "@tiptap/pm/history";
import {
  cleanRevisionStamp,
  revisionAttributes,
  revisionFromElement,
} from "./script-revisions.js";

const key = new PluginKey("script-page-revisions");
const formatting = new Set(["bold", "italic", "underline", "strike"]);

function inlineRange(doc, from, to) {
  const runs = [];
  let text = "";
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return;
    const value = node.isText
      ? node.text.slice(
          Math.max(0, from - pos),
          Math.min(node.nodeSize, to - pos),
        )
      : node.type.name === "hardBreak"
        ? "\n"
        : "";
    if (!value) return;
    const style = node.marks
      .filter((mark) => formatting.has(mark.type.name))
      .map((mark) => mark.type.name)
      .sort()
      .join(" ");
    runs.push({ end: text.length + value.length, style });
    text += value;
  });
  return { text, runs };
}

// A browser can reparse unchanged newlines as hardBreak nodes during input.
// Compare their visible text and formatting, so that reparse does not revise
// the remainder of a long paragraph, or a following page.
function trimInlineChange(before, after, oldFrom, oldTo, from, to) {
  const a = before.resolve(oldFrom),
    b = before.resolve(oldTo);
  const c = after.resolve(from),
    d = after.resolve(to);
  if (
    !a.parent.isTextblock ||
    !c.parent.isTextblock ||
    a.parent !== b.parent ||
    c.parent !== d.parent ||
    a.parent.attrs.format !== c.parent.attrs.format
  )
    return [from, to];
  const old = inlineRange(before, oldFrom, oldTo),
    next = inlineRange(after, from, to);
  const limit = Math.min(old.text.length, next.text.length);
  let prefix = 0,
    suffix = 0,
    oldRun = 0,
    newRun = 0;
  while (prefix < limit) {
    while (prefix >= old.runs[oldRun].end) oldRun++;
    while (prefix >= next.runs[newRun].end) newRun++;
    if (
      old.text[prefix] !== next.text[prefix] ||
      old.runs[oldRun].style !== next.runs[newRun].style
    )
      break;
    prefix++;
  }
  oldRun = old.runs.length - 1;
  newRun = next.runs.length - 1;
  while (suffix < limit - prefix) {
    const oldAt = old.text.length - suffix - 1,
      newAt = next.text.length - suffix - 1;
    while (oldRun > 0 && oldAt < old.runs[oldRun - 1].end) oldRun--;
    while (newRun > 0 && newAt < next.runs[newRun - 1].end) newRun--;
    if (
      old.text[oldAt] !== next.text[newAt] ||
      old.runs[oldRun].style !== next.runs[newRun].style
    )
      break;
    suffix++;
  }
  if (prefix === old.text.length && prefix === next.text.length) return null;
  return [from + prefix, to - suffix];
}

function changedRanges(transactions) {
  const ranges = [];
  transactions.forEach((transaction, index) => {
    if (
      !transaction.docChanged ||
      transaction.getMeta("addToHistory") === false ||
      transaction.getMeta("preventUpdate")
    )
      return;
    transaction.steps.forEach((step, stepIndex) => {
      const mapping = new Mapping();
      for (const map of transaction.mapping.maps.slice(stepIndex + 1))
        mapping.appendMap(map);
      for (let next = index + 1; next < transactions.length; next++)
        mapping.appendMapping(transactions[next].mapping);
      const before = transaction.docs[stepIndex];
      const after = transaction.docs[stepIndex + 1] || transaction.doc;
      let mapped = false;
      step.getMap().forEach((oldFrom, oldTo, from, to) => {
        mapped = true;
        const oldNode = before.nodeAt(oldFrom),
          node = after.nodeAt(from);
        if (oldNode?.isTextblock && node?.isTextblock) {
          // IDs, component links and revision metadata do not revise the text.
          if (
            oldNode.content.eq(node.content) &&
            oldNode.attrs.format === node.attrs.format
          )
            return;
          if (oldNode.attrs.format !== node.attrs.format) {
            to = from + 1 + node.content.size;
            from++;
          }
        }
        const range = trimInlineChange(before, after, oldFrom, oldTo, from, to);
        if (range)
          ranges.push([mapping.map(range[0], -1), mapping.map(range[1], 1)]);
      });
      if (!mapped && formatting.has(step.mark?.type.name))
        ranges.push([mapping.map(step.from, -1), mapping.map(step.to, 1)]);
    });
  });
  return ranges;
}

function stampRanges(state, ranges, stamp) {
  const tr = state.tr,
    mark = state.schema.marks.scriptRevision;
  const emptyBlocks = new Set();
  for (let [from, to] of ranges) {
    from = Math.max(0, Math.min(state.doc.content.size, from));
    to = Math.max(from, Math.min(state.doc.content.size, to));
    if (from === to) {
      const point = state.doc.resolve(from);
      if (point.parent.isTextblock) {
        if (!point.parent.content.size) emptyBlocks.add(point.before());
        else if (from < point.end()) to++;
        else from--;
      } else {
        const block = state.doc.nodeAt(from);
        if (block?.isTextblock) {
          if (!block.content.size) emptyBlocks.add(from);
          else {
            from++;
            to = from + 1;
          }
        }
      }
    }
    if (from < to) {
      tr.removeMark(from, to, mark);
      if (stamp.version !== "white" || stamp.round > 0)
        tr.addMark(from, to, mark.create(stamp));
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.isTextblock && !node.content.size) emptyBlocks.add(pos);
      });
    }
  }
  for (const pos of emptyBlocks) {
    const node = tr.doc.nodeAt(pos);
    const value = stamp.version === "white" && stamp.round === 0 ? null : stamp;
    if (JSON.stringify(node.attrs.scriptRevision) !== JSON.stringify(value))
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        scriptRevision: value,
      });
  }
  return tr.docChanged ? tr.setMeta(key, true) : null;
}

export function revisionStampPlugin(getRevision) {
  let view = null,
    frame,
    pending = [],
    compositionBefore = null,
    compositionId = null;
  const reset = () => {
    pending = [];
    compositionBefore = null;
    compositionId = null;
    if (frame != null) cancelAnimationFrame(frame);
  };
  const unchangedComposition = (doc) =>
    compositionBefore &&
    compositionBefore.textBetween(
      0,
      compositionBefore.content.size,
      "\n",
      "\n",
    ) === doc.textBetween(0, doc.content.size, "\n", "\n");
  const flushComposition = () => {
    if (!view || view.isDestroyed || !pending.length) return;
    if (view.composing) {
      frame = requestAnimationFrame(flushComposition);
      return;
    }
    const stamp = cleanRevisionStamp(getRevision());
    const tr =
      stamp && !unchangedComposition(view.state.doc)
        ? stampRanges(view.state, pending, stamp)
        : null;
    const id = compositionId;
    reset();
    if (tr) {
      // Keep the provenance step in the native IME's undo group. No text step,
      // caret movement or writing reward is introduced by this delayed stamp.
      if (id != null) tr.setMeta("composition", id);
      view.dispatch(tr.setMeta("skipWritingReward", true));
    }
  };
  const compositionEnded = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(flushComposition);
  };
  return new Plugin({
    key,
    appendTransaction(transactions, previous, state) {
      const stamp = cleanRevisionStamp(getRevision());
      if (
        !stamp ||
        transactions.some(
          (transaction) =>
            transaction.getMeta("preventUpdate") ||
            isHistoryTransaction(transaction),
        )
      ) {
        reset();
        return null;
      }
      if (transactions.some((transaction) => transaction.getMeta(key)))
        return null;
      for (const transaction of transactions)
        pending = pending.map(([from, to]) => [
          transaction.mapping.map(from, -1),
          transaction.mapping.map(to, 1),
        ]);
      const ranges = [...pending, ...changedRanges(transactions)];
      if (!ranges.length) return null;
      if (view?.composing) {
        compositionBefore ||= transactions[0].before;
        for (const transaction of transactions)
          if (transaction.getMeta("composition") != null)
            compositionId = transaction.getMeta("composition");
        pending = ranges;
        return null;
      }
      const unchanged = unchangedComposition(state.doc);
      reset();
      return unchanged ? null : stampRanges(state, ranges, stamp);
    },
    view(editorView) {
      view = editorView;
      view.dom.addEventListener("compositionend", compositionEnded);
      return {
        destroy() {
          view.dom.removeEventListener("compositionend", compositionEnded);
          reset();
          view = null;
        },
      };
    },
  });
}

export const ScriptRevisionMark = Mark.create({
  name: "scriptRevision",
  addOptions: () => ({ getRevision: () => null }),
  addAttributes: () => ({
    version: { default: "white", rendered: false },
    round: { default: 0, rendered: false },
  }),
  parseHTML: () => [
    {
      tag: "span[data-script-revision-version]",
      getAttrs: (element) => revisionFromElement(element) || false,
    },
  ],
  renderHTML: ({ HTMLAttributes, mark }) => [
    "span",
    { ...HTMLAttributes, ...revisionAttributes(mark.attrs) },
    0,
  ],
  addProseMirrorPlugins() {
    return [revisionStampPlugin(this.options.getRevision)];
  },
});
