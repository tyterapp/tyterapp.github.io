import { Step, StepResult, StepMap } from "@tiptap/pm/transform";
import { rebasePageVersionContent } from "./page-versions.js";

const fields = [
  "pageVersions",
  "sceneVariants",
  "sceneShots",
  "comments",
  "props",
  "components",
  "relationships",
  "componentFolders",
  "propFolders",
  "graphLayout",
];
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (value) => structuredClone(value);

// Apply only the changed resource entries, preserving unrelated edits made
// outside the text editor between burning and undoing a page version.
function delta(current, before, after) {
  if (equal(before, after)) return current;
  if (equal(current, before)) return clone(after);
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    [...before, ...after].every((entry) => entry?.id)
  ) {
    const old = new Map(before.map((entry) => [entry.id, entry]));
    const next = new Map(after.map((entry) => [entry.id, entry]));
    const live = new Map((current || []).map((entry) => [entry.id, entry]));
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      if (equal(old.get(id), next.get(id))) continue;
      const value = delta(live.get(id), old.get(id), next.get(id));
      if (value === undefined) live.delete(id);
      else live.set(id, value);
    }
    return [...live.values()];
  }
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const result = { ...current };
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      if (equal(before[key], after[key])) continue;
      const value = delta(current?.[key], before[key], after[key]);
      if (value === undefined) delete result[key];
      else result[key] = value;
    }
    return result;
  }
  return current;
}

// A real history step makes the page catalogue and text one undo/redo action.
// It does not alter the ProseMirror document or its position mapping itself.
export class PageVersionStateStep extends Step {
  constructor(before, after, kind = "burn", beforeContent, afterContent) {
    super();
    this.before = before;
    this.after = after;
    this.kind = kind;
    this.beforeContent = beforeContent;
    this.afterContent = afterContent;
  }
  apply(doc) {
    return StepResult.ok(doc);
  }
  getMap() {
    return StepMap.empty;
  }
  invert() {
    return new PageVersionStateStep(
      this.after,
      this.before,
      this.kind,
      this.afterContent,
      this.beforeContent,
    );
  }
  map(mapping) {
    if (this.kind === "pagination") return this;
    const mapped = (state) => ({
      ...state,
      ...(state.pageVersions
        ? {
            pageVersions: {
              ...state.pageVersions,
              pages: state.pageVersions.pages.map((page) => ({
                ...page,
                from: mapping.map(page.from, -1),
                to: mapping.map(page.to, -1),
              })),
            },
          }
        : {}),
      ...(state.comments
        ? {
            comments: state.comments.map((comment) =>
              Number.isInteger(comment.anchor)
                ? { ...comment, anchor: mapping.map(comment.anchor, -1) }
                : comment,
            ),
          }
        : {}),
    });
    return new PageVersionStateStep(
      mapped(this.before),
      mapped(this.after),
      this.kind,
    );
  }
  toJSON() {
    return {
      stepType: "tyterPageVersionState",
      before: this.before,
      after: this.after,
      kind: this.kind,
      beforeContent: this.beforeContent,
      afterContent: this.afterContent,
    };
  }
  static fromJSON(_schema, json) {
    return new PageVersionStateStep(
      json.before,
      json.after,
      json.kind,
      json.beforeContent,
      json.afterContent,
    );
  }
}
Step.jsonID("tyterPageVersionState", PageVersionStateStep);

export function pageVersionStateStep(before, after) {
  const changed = fields.filter((key) => !equal(before[key], after[key]));
  return new PageVersionStateStep(
    clone(Object.fromEntries(changed.map((key) => [key, before[key]]))),
    clone(Object.fromEntries(changed.map((key) => [key, after[key]]))),
  );
}

export function pageVersionLayoutStep(before, after) {
  // Page colors and ranges are immutable metadata. Keep them in the same
  // typing undo event without duplicating the screenplay on each reflow.
  return new PageVersionStateStep(
    { pageVersions: before.pageVersions },
    { pageVersions: after.pageVersions },
    "pagination",
    before.content,
    after.content,
  );
}

export function pageVersionChanges(transaction) {
  return transaction.steps.filter(
    (step) => step instanceof PageVersionStateStep,
  );
}

export function applyPageVersionChanges(document, steps = []) {
  let next = document;
  for (const step of steps) {
    const liveColors =
      next.pageVersions?.mode === "colors" && step.kind === "pagination"
        ? new Map(next.pageVersions.pages.map((page) => [page.id, page.active]))
        : null;
    next = { ...next };
    for (const key of new Set([
      ...Object.keys(step.before),
      ...Object.keys(step.after),
    ]))
      next[key] =
        key === "pageVersions"
          ? step.kind === "pagination"
            ? rebasePageVersionContent(
                { content: step.afterContent, pageVersions: step.after[key] },
                document.content,
              ).pageVersions
            : clone(step.after[key])
          : delta(next[key], step.before[key], step.after[key]);
    if (liveColors && next.pageVersions)
      next.pageVersions = {
        ...next.pageVersions,
        pages: next.pageVersions.pages.map((page) =>
          liveColors.has(page.id)
            ? { ...page, active: liveColors.get(page.id) }
            : page,
        ),
      };
  }
  return next;
}
