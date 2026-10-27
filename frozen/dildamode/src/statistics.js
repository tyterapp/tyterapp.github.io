import { getWordCount, nodeText } from "./data.js";

export const STAT_FORMATS = [
  ["scene", "Заголовки сцен"],
  ["action", "Действие"],
  ["character", "Персонажи"],
  ["speech", "Реплики"],
  ["parenthetical", "Ремарки"],
  ["transition", "Переходы"],
  ["plain", "Обычный текст"],
];

export function documentStatistics(document) {
  const blocks = (document.content?.content || [])
    .map((node) => ({
      format: node.attrs?.format || "action",
      text: nodeText(node),
      words: getWordCount({ content: [node] }),
    }))
    .filter((block) => block.text.trim());
  const text = blocks.map((block) => block.text).join("\n");
  const formats = STAT_FORMATS.map(([key, label]) => ({
    key,
    label,
    count: blocks.filter((block) => block.format === key).length,
  }));
  const scenes = blocks.filter((block) => block.format === "scene");
  const sceneTypes = { interior: 0, exterior: 0, mixed: 0, other: 0 };
  for (const scene of scenes) {
    const prefix = scene.text.trim().toUpperCase();
    if (
      /^(INT|EXT|ИНТ|ЭКС|НАТ)\.?\s*\/\s*(INT|EXT|ИНТ|ЭКС|НАТ)(?=[.\s/]|$)/u.test(
        prefix,
      )
    )
      sceneTypes.mixed++;
    else if (/^(INT|ИНТ)(?=[.\s/]|$)/u.test(prefix)) sceneTypes.interior++;
    else if (/^(EXT|ЭКС|НАТ)(?=[.\s/]|$)/u.test(prefix)) sceneTypes.exterior++;
    else sceneTypes.other++;
  }
  const characters = new Map();
  let speaker = null;
  for (const block of blocks) {
    if (block.format === "character") {
      speaker = block.text
        .replace(/\s*\([^)]*\)\s*$/u, "")
        .trim()
        .toLocaleUpperCase("ru-RU");
      if (speaker && !characters.has(speaker))
        characters.set(speaker, {
          name: speaker,
          cues: 0,
          speeches: 0,
          words: 0,
        });
      if (speaker) characters.get(speaker).cues++;
    } else if (block.format === "speech") {
      if (speaker) {
        const character = characters.get(speaker);
        character.speeches++;
        character.words += block.words;
      }
    } else if (block.format !== "parenthetical") speaker = null;
  }
  const words = blocks.reduce((sum, block) => sum + block.words, 0);
  const dialogueWords = blocks
    .filter((block) => block.format === "speech")
    .reduce((sum, block) => sum + block.words, 0);
  // A screenplay page is approximately 55 lines; dialogue has a narrower measure.
  const lines = blocks.reduce((sum, block) => {
    const width =
      { speech: 35, parenthetical: 26, character: 30 }[block.format] || 62;
    return (
      sum +
      block.text
        .split("\n")
        .reduce(
          (n, line) => n + Math.max(1, Math.ceil([...line].length / width)),
          0,
        ) +
      (["character", "parenthetical"].includes(block.format) ? 0 : 1)
    );
  }, 0);
  const comments = document.comments || [];
  return {
    words,
    charactersWithSpaces: [...text.replaceAll("\n", "")].length,
    charactersWithoutSpaces: [...text.replace(/\s/gu, "")].length,
    paragraphs: blocks.length,
    scenes: scenes.length,
    sceneTypes,
    formats,
    pages: Math.ceil(lines / 55),
    readingMinutes: Math.ceil(words / 200),
    dialogueWords,
    dialoguePercent: words ? Math.round((dialogueWords / words) * 100) : 0,
    characters: [...characters.values()].sort(
      (a, b) => b.words - a.words || a.name.localeCompare(b.name, "ru"),
    ),
    components: (document.components || []).filter((c) => c.enabled !== false)
      .length,
    characterComponents: (document.components || []).filter(
      (c) => c.enabled !== false && c.type === "character",
    ).length,
    places: (document.components || []).filter(
      (c) => c.enabled !== false && c.type === "place",
    ).length,
    comments: comments.length,
    openComments: comments.filter((c) => !c.resolved).length,
    resolvedComments: comments.filter((c) => c.resolved).length,
  };
}
