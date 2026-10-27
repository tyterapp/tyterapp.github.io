// Keep the stored color compatible with older documents and TYT exports.
// The production stage is derived until the user explicitly chooses a stage.
export const OUTLINE_STAGES = [
  {
    id: "pre-production",
    label: "Pre production",
    color: "#4c6baa",
    cssColor: "oklch(0.533 0.106 263.373)",
    darkColor: "oklch(0.803 0.077 266.512)",
  },
  {
    id: "production",
    label: "Production",
    color: "#94611f",
    cssColor: "oklch(0.536 0.103 68.568)",
    darkColor: "oklch(0.823 0.097 76.507)",
  },
  {
    id: "post-production",
    label: "Post production",
    color: "#7956a3",
    cssColor: "oklch(0.524 0.122 303.437)",
    darkColor: "oklch(0.793 0.091 305.018)",
  },
];

const legacyColors = [
  ["#33313b", 0],
  ["#d89b17", 0],
  ["#e86847", 1],
  ["#609923", 1],
  ["#aa45ef", 2],
  ["#1b2eff", 2],
];
function rgb(value) {
  const match = String(value || "").match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit).join("")
      : match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}
export function outlineStage(card) {
  const color = String(card?.color || "").toLowerCase();
  const exact = OUTLINE_STAGES.find((stage) => stage.color === color);
  if (exact) return exact;
  const legacy = legacyColors.find((item) => item[0] === color);
  if (legacy) return OUTLINE_STAGES[legacy[1]];
  const value = rgb(color);
  if (!value) return OUTLINE_STAGES[0];
  let closest = legacyColors[0],
    distance = Infinity;
  for (const item of legacyColors) {
    const candidate = rgb(item[0]);
    const next = candidate.reduce(
      (sum, channel, index) => sum + (channel - value[index]) ** 2,
      0,
    );
    if (next < distance) {
      closest = item;
      distance = next;
    }
  }
  return OUTLINE_STAGES[closest[1]];
}
export function outlineStageStyle(card) {
  const stage = outlineStage(card);
  return {
    "--card-color-light": stage.cssColor,
    "--card-color-dark": stage.darkColor,
  };
}
