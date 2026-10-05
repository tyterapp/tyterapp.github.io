export const SCREENPLAY_LAYOUT = Object.freeze({
  width: 856,
  height: 1056,
  left: 104,
  right: 96,
  top: 88,
  bottom: 88,
  gap: 20,
  lineHeight: 1.25,
});

export const clampDocumentZoom = (value) =>
  Math.max(100, Math.min(200, Math.round(Number(value) || 100)));

export function screenplayLayout(fontSize = 12) {
  const size = Math.max(12, Math.min(26, Number(fontSize) || 12));
  const scale = size / 12;
  return {
    ...SCREENPLAY_LAYOUT,
    height: SCREENPLAY_LAYOUT.height * scale,
    top: SCREENPLAY_LAYOUT.top * scale,
    bottom: SCREENPLAY_LAYOUT.bottom * scale,
    fontSize: size,
  };
}

export function screenplayBlockLayout(format) {
  const gap = SCREENPLAY_LAYOUT.gap;
  switch (format) {
    case "character":
      return { left: 0.3667, width: 0.55, after: 0, before: 0 };
    case "speech":
      return { left: 0.1667, width: 0.5833, after: gap, before: 0 };
    case "parenthetical":
      return { left: 0.2667, width: 0.4833, after: 0, before: 0 };
    default:
      return {
        left: 0,
        width: 1,
        after: gap,
        before: format === "scene" ? gap : 0,
      };
  }
}

export const dramaValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(10, Math.round(number)))
    : 0;
};
