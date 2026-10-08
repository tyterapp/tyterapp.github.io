import { X, ArrowUpRight } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { nodeText } from "./data.js";

export const characterName = (text) =>
  text
    .trim()
    .replace(
      /\s*\((?:V\.O\.|O\.S\.|CONT'D|CONT’D|ЗК|З\.К\.|ПРОД\.)\)\s*$/iu,
      "",
    )
    .trim()
    .toLocaleUpperCase();
export function characterDialogues(content, name) {
  const blocks = content?.content || [],
    rows = [];
  let scene = "",
    number = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.attrs?.format === "scene") {
      scene = nodeText(block);
      number++;
    }
    if (
      block.attrs?.format !== "character" ||
      characterName(nodeText(block)) !== characterName(name)
    )
      continue;
    const dialogue = [];
    for (
      let j = i + 1;
      j < blocks.length &&
      ["speech", "parenthetical"].includes(blocks[j].attrs?.format);
      j++
    )
      dialogue.push(blocks[j]);
    if (
      dialogue.some(
        (line) => line.attrs.format === "speech" && nodeText(line).trim(),
      )
    )
      rows.push({
        blockId: block.attrs.blockId,
        name: nodeText(block),
        scene,
        number,
        dialogue,
      });
  }
  return rows;
}
export default function CharacterDialogue({ content, name, onClose, onGo }) {
  useLanguage();
  const rows = characterDialogues(content, name);
  return (
    <main
      className="character-dialogue-view"
      aria-label={t("Реплики персонажа")}
    >
      <div className="character-dialogue-heading">
        <div>
          <h2>{name}</h2>
          <span>
            {t("Реплики персонажа")} · {rows.length}
          </span>
        </div>
        <button className="quiet-button" onClick={onClose}>
          <X size={16} />
          {t("Вернуться к сценарию")}
        </button>
      </div>
      <div className="character-dialogue-list">
        {rows.map((row) => (
          <article key={row.blockId} className="character-dialogue-card">
            <button
              className="character-dialogue-scene"
              onClick={() => onGo(row.blockId)}
            >
              <span>
                {row.number}. {row.scene}
              </span>
              <ArrowUpRight size={16} />
            </button>
            <h3>{row.name}</h3>
            {row.dialogue.map((block) => (
              <p className={block.attrs.format} key={block.attrs.blockId}>
                {nodeText(block)}
              </p>
            ))}
          </article>
        ))}
        {!rows.length && (
          <p className="sidebar-empty">{t("У персонажа пока нет реплик")}</p>
        )}
      </div>
    </main>
  );
}
