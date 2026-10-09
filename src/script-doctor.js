import { nodeText } from "./data.js";
import { SCENE_VARIANTS, sceneLetter } from "./scene-variants.js";

const SCENE_TYPE = /^(?:ИНТ|ЭКС|НАТ|ПАВ|INT|EXT|EST|I\/E)[.\s/]/iu;
const SCENE_TIME =
  /(?:[—–-]\s*|\s)(?:ДЕНЬ|НОЧЬ|УТРО|ВЕЧЕР|РАССВЕТ|ЗАКАТ|ПОЗЖЕ|ПРОДОЛЖЕНИЕ|DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|LATER|CONTINUOUS)\s*[.]*$/iu;

export function inspectScript(
  content,
  { scenes = new Map(), offset = 0 } = {},
) {
  const nodes = content?.content || [],
    findings = [];
  const add = (kind, node, title, detail) =>
    findings.push({
      id: `${kind}-${node.attrs.blockId}-${findings.length}`,
      kind,
      blockId: node.attrs.blockId,
      title,
      detail,
      quote: nodeText(node),
    });
  let sceneNumber = offset;
  let speaker = false;
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index],
      text = nodeText(node).trim(),
      format = node.attrs?.format;
    if (format !== "speech" && format !== "parenthetical")
      speaker = format === "character" && !!text;
    if (format === "scene") sceneNumber++;
    if (!text) continue;
    if (format === "scene") {
      if (!SCENE_TYPE.test(text))
        add(
          "headings",
          node,
          "Не указан тип сцены",
          "Начните заголовок с ИНТ./ЭКС. или INT./EXT.",
        );
      if (!SCENE_TIME.test(text))
        add(
          "headings",
          node,
          "Не указано время суток",
          "Добавьте ДЕНЬ/НОЧЬ или DAY/NIGHT в конец заголовка.",
        );
      let end = index + 1;
      while (end < nodes.length && nodes[end].attrs?.format !== "scene") end++;
      const body = nodes
        .slice(index + 1, end)
        .map(nodeText)
        .join(" ")
        .trim();
      if (!body)
        add(
          "headings",
          node,
          "Сцена без текста",
          "После заголовка пока нет действия или диалога.",
        );
      const signature = nodes
        .slice(index, end)
        .map(
          (block) =>
            `${block.attrs.format}:${nodeText(block).trim().toLocaleLowerCase().replace(/\s+/g, " ")}`,
        )
        .join("\n");
      const previous = scenes.get(signature);
      if (body && previous && previous.id !== node.attrs.blockId)
        add(
          "duplicates",
          node,
          "Возможный дубликат сцены",
          `Повтор сцены {0}|${previous.number}`,
        );
      else if (!previous)
        scenes.set(signature, { id: node.attrs.blockId, number: sceneNumber });
    }
    if (
      (format === "action" || format === "plain") &&
      SCENE_TYPE.test(text) &&
      SCENE_TIME.test(text)
    )
      add(
        "headings",
        node,
        "Неверный формат заголовка",
        "Оформите эту строку как заголовок сцены · Ctrl+1.",
      );
    if (
      format === "action" &&
      text.length > 20 &&
      nodes[index - 1]?.attrs?.format === "action" &&
      nodeText(nodes[index - 1])
        .trim()
        .toLocaleLowerCase() === text.toLocaleLowerCase()
    )
      add(
        "duplicates",
        node,
        "Повтор действия",
        "Два одинаковых абзаца действия идут подряд.",
      );
    if (format === "character") {
      let next = index + 1;
      while (nodes[next]?.attrs?.format === "parenthetical") next++;
      if (
        nodes[next]?.attrs?.format !== "speech" ||
        !nodeText(nodes[next]).trim()
      )
        add(
          "dialogue",
          node,
          "Персонаж без реплики",
          "После имени персонажа должна идти реплика.",
        );
    }
    if (format === "speech") {
      if (!speaker)
        add(
          "dialogue",
          node,
          "Реплика без персонажа",
          "Перед репликой укажите имя в формате «Персонаж».",
        );
    }
    if (format === "parenthetical") {
      if (!speaker)
        add(
          "dialogue",
          node,
          "Ремарка без персонажа",
          "Перед ремаркой укажите имя в формате «Персонаж».",
        );
      if (!text.startsWith("(") || !text.endsWith(")"))
        add(
          "dialogue",
          node,
          "Ремарка без скобок",
          "Заключите ремарку в круглые скобки.",
        );
    }
  }
  return findings;
}

// Inspect only the selected screenplay version. Read live A–F text instead of
// stale snapshots, and don't treat copies of the same scene as duplicate scenes.
export function inspectDocumentScript(document) {
  const blocks = document.content?.content || [],
    findings = [],
    scenes = new Map();
  let number = 0;
  const add = (nodes, sceneId = null, variant = null) => {
    findings.push(
      ...inspectScript({ content: nodes }, { scenes, offset: number - 1 }).map(
        (finding) => ({
          ...finding,
          id: `${variant || "prelude"}-${finding.id}`,
          sceneId,
          variant,
          sceneNumber: sceneId ? number : null,
        }),
      ),
    );
  };
  for (let start = 0; start < blocks.length;) {
    let end = start + 1;
    const heading = blocks[start];
    while (end < blocks.length && blocks[end].attrs?.format !== "scene") end++;
    if (heading.attrs?.format !== "scene") add(blocks.slice(start, end));
    else {
      number++;
      const id = heading.attrs.blockId,
        active = sceneLetter(heading);
      for (const letter of SCENE_VARIANTS) {
        const nodes =
          letter === active
            ? blocks.slice(start, end)
            : document.sceneVariants?.[id]?.[letter];
        if (nodes) add(nodes, id, letter);
      }
    }
    start = end;
  }
  return findings;
}

export function doctorCondition(count) {
  const errors = Math.max(0, Math.floor(Number(count) || 0));
  return {
    errors,
    fill: Math.min(errors / 12, 1),
    flies: Math.min(errors, 12),
  };
}
