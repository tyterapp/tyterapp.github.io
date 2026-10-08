import { nodeText } from "./data.js";

export function inspectScript(content) {
  const nodes = content?.content || [],
    findings = [],
    scenes = new Map();
  const add = (kind, node, title, detail) =>
    findings.push({
      id: `${kind}-${node.attrs.blockId}-${findings.length}`,
      kind,
      blockId: node.attrs.blockId,
      title,
      detail,
      quote: nodeText(node),
    });
  let sceneNumber = 0;
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
      if (!/^(?:ИНТ|ЭКС|НАТ|INT|EXT)[.\s/]/iu.test(text))
        add(
          "headings",
          node,
          "Не указан тип сцены",
          "Начните заголовок с ИНТ./ЭКС. или INT./EXT.",
        );
      if (
        !/(?:[—–-]\s*|\s)(?:ДЕНЬ|НОЧЬ|УТРО|ВЕЧЕР|РАССВЕТ|ЗАКАТ|ПОЗЖЕ|ПРОДОЛЖЕНИЕ|DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|LATER|CONTINUOUS)\s*[.]*$/iu.test(
          text,
        )
      )
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
      if (body && scenes.has(signature))
        add(
          "duplicates",
          node,
          "Возможный дубликат сцены",
          `Повтор сцены {0}|${scenes.get(signature)}`,
        );
      else scenes.set(signature, sceneNumber);
    }
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
  }
  return findings;
}
