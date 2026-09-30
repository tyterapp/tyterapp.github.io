export const DOCUMENT_FONTS = [
  {
    id: "courier",
    name: "Courier",
    family:
      '"Screenplay Courier Cyrillic", "Screenplay Courier Fallback", "Courier New", monospace',
  },
  {
    id: "consolas",
    name: "Consolas",
    family: 'Consolas, "Courier New", monospace',
  },
  { id: "arial", name: "Arial", family: "Arial, sans-serif" },
  { id: "georgia", name: "Georgia", family: "Georgia, serif" },
  { id: "times", name: "Times New Roman", family: '"Times New Roman", serif' },
];
export const documentFont = (id) =>
  DOCUMENT_FONTS.find((font) => font.id === id) || DOCUMENT_FONTS[0];
