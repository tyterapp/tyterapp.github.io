export const SCRIPT_VERSIONS = [
  { id: "white", label: "v1 White", hue: 0, chroma: 0 },
  { id: "blue", label: "v2 Blue", hue: 240, chroma: 0.012 },
  { id: "pink", label: "v3 Pink", hue: 350, chroma: 0.012 },
  { id: "yellow", label: "v4 Yellow", hue: 105, chroma: 0.016 },
  { id: "green", label: "v5 Green", hue: 145, chroma: 0.012 },
  { id: "goldenrod", label: "v6 Goldenrod", hue: 85, chroma: 0.016 },
  { id: "buff", label: "v7 Buff", hue: 65, chroma: 0.012 },
  { id: "salmon", label: "v8 Salmon", hue: 35, chroma: 0.012 },
  { id: "cherry", label: "v9 Cherry", hue: 5, chroma: 0.012 },
];

export const SCRIPT_VERSION_GEOMETRY = {
  white: { shape: "circle", symbol: "●", cx: 12, cy: 12, r: 8.5 },
  blue: { shape: "triangle", symbol: "▲", path: "m12 3 9.3 16H2.7Z" },
  pink: { shape: "diamond", symbol: "◆", path: "m12 2 9 10-9 10-9-10Z" },
  yellow: {
    shape: "hexagon",
    symbol: "⬢",
    path: "m7 3.3 10 0 5 8.7-5 8.7H7L2 12Z",
  },
  green: {
    shape: "pentagon",
    symbol: "⬟",
    path: "m12 2 10 7.3-3.8 11.2H5.8L2 9.3Z",
  },
  goldenrod: {
    shape: "octagon",
    symbol: "⯃",
    path: "M8.3 2.8h7.4l5.5 5.5v7.4l-5.5 5.5H8.3l-5.5-5.5V8.3Z",
  },
  buff: {
    shape: "star",
    symbol: "★",
    path: "m12 2.1 3 6.2 6.8 1-4.9 4.8 1.2 6.8-6.1-3.2-6.1 3.2 1.2-6.8-4.9-4.8 6.8-1Z",
  },
  salmon: {
    shape: "ellipse",
    symbol: "⬭",
    cx: 12,
    cy: 12,
    rx: 10,
    ry: 6.8,
    transform: "rotate(-30 12 12)",
  },
  cherry: {
    shape: "cross",
    symbol: "✚",
    path: "M8.5 2.5h7v6h6v7h-6v6h-7v-6h-6v-7h6Z",
  },
};

// sRGB equivalents of the interface's existing OKLCH swatches. Formats such as
// PDF, DOCX and FDX require explicit RGB; all revision labels use a darker ink.
const exportColours = {
  white: ["#FFFFFF", "#4D4D4D", "#FFFFFF"],
  blue: ["#B4EDFF", "#1A3B51", "#EEF6FD"],
  pink: ["#FFCFEC", "#4D2C3C", "#FCF2F6"],
  yellow: ["#ECE8AA", "#3C3915", "#F6F6EA"],
  green: ["#C4F3C4", "#253F26", "#F0F7F0"],
  goldenrod: ["#FDE1A7", "#453513", "#FAF5E9"],
  buff: ["#FFDAAD", "#4B3217", "#FBF4ED"],
  salmon: ["#FFD2C1", "#502D24", "#FDF2F0"],
  cherry: ["#F2AFBD", "#44202A", "#FDF2F4"],
};

export function scriptVersionGeometry(id) {
  return Object.hasOwn(SCRIPT_VERSION_GEOMETRY, id)
    ? SCRIPT_VERSION_GEOMETRY[id]
    : SCRIPT_VERSION_GEOMETRY.white;
}

export function scriptVersionExportStyle(id) {
  const [color, ink, background] = Object.hasOwn(exportColours, id)
    ? exportColours[id]
    : exportColours.white;
  const { shape, symbol } = scriptVersionGeometry(id);
  return { color, ink, background, shape, symbol };
}

export function scriptVersionSwatchStyle(id) {
  const version =
    SCRIPT_VERSIONS.find((entry) => entry.id === id) || SCRIPT_VERSIONS[0];
  return {
    "--version-hue": version.hue,
    "--version-swatch-lightness":
      version.id === "white" ? 1 : version.id === "cherry" ? 0.82 : 0.92,
    "--version-swatch-chroma": version.id === "white" ? 0 : 0.08,
  };
}
