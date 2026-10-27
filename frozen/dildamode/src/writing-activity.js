import { isHistoryTransaction } from "@tiptap/pm/history";
import { ReplaceStep } from "@tiptap/pm/transform";

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
