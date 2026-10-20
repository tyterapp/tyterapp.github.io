import { dramaValue } from "./document-layout.js";

// Zero in older projects means unassigned. New edits use the 1–10 scale,
// without rewriting historical project data merely by opening the graph.
export const sceneDrama = (value) => Math.max(1, dramaValue(value));
