import { isHistoryTransaction } from "@tiptap/pm/history";
import { ReplaceStep } from "@tiptap/pm/transform";
import { getWordCount } from "./data.js";

const screenplayWordTotals = new WeakMap();

// Immutable ProseMirror nodes survive edits elsewhere in the screenplay. Reuse
// their totals instead of converting both complete documents to JSON per key.
export function screenplayWordCount(doc) {
  if (screenplayWordTotals.has(doc)) return screenplayWordTotals.get(doc);
  let total = 0;
  doc.forEach((node) => {
    if (!screenplayWordTotals.has(node))
      screenplayWordTotals.set(node, getWordCount({ content: [node.toJSON()] }));
    total += screenplayWordTotals.get(node);
  });
  screenplayWordTotals.set(doc, total);
  return total;
}

export const committedCharacters = (text) => {
  let count = 0;
  for (const character of text) count++;
  return count;
};

// Count user insertions, including paste and replacements, but not formatting,
// moving existing text, undo/redo, or provisional IME text. IME is credited
// separately from compositionend.data, which contains the committed text.
export function writtenCharacters(transaction, composition = {}) {
  if (
    isHistoryTransaction(transaction) ||
    transaction.getMeta("preventUpdate") ||
    transaction.getMeta("skipWritingReward") ||
    transaction.getMeta("uiEvent") === "drop" ||
    composition.active ||
    transaction.getMeta("composition") != null
  )
    return 0;
  let inserted = 0;
  for (const [index, step] of transaction.steps.entries()) {
    if (!(step instanceof ReplaceStep)) continue;
    const text = step.slice.content.textBetween(0, step.slice.content.size, "");
    const previous = transaction.docs[index].textBetween(
      step.from,
      step.to,
      "",
    );
    if (text === previous) continue;
    const count = committedCharacters(text);
    inserted += count;
  }
  return inserted;
}
