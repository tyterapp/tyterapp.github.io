import { createProject } from "../../src/data.js";
import { libraryFromDocument } from "../../src/component-library.js";

export const paragraph = (format, text, blockId, id) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [
    {
      type: "text",
      text,
      ...(id
        ? {
            marks: [
              { type: "entity", attrs: { id, color: "#8a799a" } },
              { type: "bold" },
            ],
          }
        : {}),
    },
  ],
});

export function componentClearFixture() {
  const document = createProject("Очистка компонентов");
  document.id = "clear-document";
  document.components = [
    {
      id: "anna",
      name: "Анна",
      type: "character",
      color: "#8a799a",
      folderId: "characters",
    },
    {
      id: "boris",
      name: "Борис",
      type: "character",
      color: "#738598",
      enabled: false,
    },
    {
      id: "room",
      name: "Комната",
      type: "place",
      color: "#738598",
      librarySource: {
        libraryId: "saved-library",
        componentId: "source-room",
        name: "Сохранённая библиотека",
      },
    },
  ];
  document.componentFolders = [
    { id: "characters", name: "Герои", category: "character" },
  ];
  document.collapsedComponentFolders = ["characters"];
  document.content.content = [
    paragraph("scene", "ИНТ. КОМНАТА — ДЕНЬ", "scene", "room"),
    paragraph("action", "Анна открывает дверь.", "action", "anna"),
    paragraph("character", "АННА", "character", "anna"),
    paragraph("speech", "Борис, входи.", "speech", "boris"),
  ];
  document.sceneVariants = {
    scene: {
      B: [
        paragraph("scene", "ЭКС. КОМНАТА — НОЧЬ", "scene", "room"),
        paragraph("action", "Анна ждёт.", "alternative", "anna"),
      ],
    },
  };
  document.notes = {
    content: {
      type: "doc",
      content: [paragraph("plain", "Анна в заметках.", "note", "anna")],
    },
    comments: [],
  };
  document.relationships = [
    {
      id: "relationship",
      sourceComponentId: "anna",
      targetComponentId: "boris",
      label: "Друзья",
      direction: "mutual",
    },
  ];
  document.graphLayout = {
    characterPositions: { anna: { x: 10, y: 20 } },
    camera: { x: 1, y: 2 },
  };
  document.props = [
    { id: "door", name: "Дверь", category: "Objects", componentId: "room" },
  ];
  document.comments = [
    { id: "comment", text: "Сохранить текст", blockId: "action" },
  ];
  const other = createProject("Другой документ");
  other.id = "other-document";
  other.components = [
    { id: "other", name: "Другой персонаж", type: "character" },
  ];
  const library = libraryFromDocument({
    ...other,
    id: "saved-library",
    title: "Сохранённая библиотека",
    components: [{ id: "source-room", name: "Комната", type: "place" }],
  });
  return { document, other, library };
}
