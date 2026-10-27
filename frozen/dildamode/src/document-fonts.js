export const DOCUMENT_FONTS = [
  {
    id: "courier",
    name: "Courier",
    family:
      '"Screenplay Courier Cyrillic", "Screenplay Courier Fallback", "Courier New", monospace',
  },
  {
    id: "courier-new",
    name: "Courier New",
    family:
      '"Tyter Courier New", "Screenplay Courier Cyrillic", "Courier New", monospace',
  },
  {
    id: "courier-prime",
    name: "Courier Prime",
    languages: ["en"],
    family:
      '"Tyter Courier Prime", "Screenplay Courier Cyrillic", "Courier New", monospace',
  },
  {
    id: "consolas",
    name: "Consolas",
    family: 'Consolas, "Courier New", monospace',
  },
  { id: "arial", name: "Arial", family: "Arial, sans-serif" },
  { id: "georgia", name: "Georgia", family: "Georgia, serif" },
  { id: "times", name: "Times New Roman", family: '"Times New Roman", serif' },
  {
    id: "marginalis",
    name: "Marginalis",
    sceneOnly: true,
    family: '"Marginalis", "Screenplay Courier Cyrillic", monospace',
  },
];
export const documentFonts = (language) =>
  DOCUMENT_FONTS.filter(
    (font) => !language || !font.languages || font.languages.includes(language),
  );
export const documentFont = (id, language) =>
  documentFonts(language).find((font) => font.id === id) || DOCUMENT_FONTS[0];

export function documentFontStyles(id, language) {
  const font = documentFont(id, language);
  return {
    "--script-font-family": `"open-arrow", ${(font.sceneOnly ? DOCUMENT_FONTS[0] : font).family}`,
    "--script-scene-font-family": `"open-arrow", ${font.family}`,
  };
}
