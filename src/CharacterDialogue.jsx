import { X, ArrowUpRight } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { nodeText } from "./data.js";
import { useMemo } from "react";

export const characterName = (text) =>
  text
    .trim()
    .replace(
      /\s*\((?:V\.O\.|O\.S\.|CONT'D|CONT’D|ЗК|З\.К\.|ПРОД\.)\)\s*$/iu,
      "",
    )
    .trim()
    .toLocaleUpperCase();
function dialogueIndex(content) {
  const blocks = content?.content || [],
    characters = new Map();
  let scene = "",
    number = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.attrs?.format === "scene") {
      scene = nodeText(block);
      number++;
    }
    if (block.attrs?.format !== "character") continue;
    const name = characterName(nodeText(block));
    if (!name) continue;
    if (!characters.has(name)) characters.set(name, []);
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
      characters.get(name).push({
        blockId: block.attrs.blockId,
        order: i,
        name: nodeText(block),
        scene,
        number,
        dialogue,
      });
  }
  return characters;
}
export function characterDialogues(content, name) {
  return dialogueIndex(content).get(characterName(name)) || [];
}
export default function CharacterDialogue({
  content,
  name,
  onCharacter,
  onClose,
  onGo,
}) {
  useLanguage();
  const index = useMemo(() => dialogueIndex(content), [content]);
  const all = name === true;
  const rows = all
    ? [...index.values()].flat().sort((a, b) => a.order - b.order)
    : index.get(characterName(name)) || [];
  const characters = [...index.keys()];
  return (
    <main
      className="character-dialogue-view"
      aria-label={t("Реплики персонажа")}
    >
      <nav
        className="character-dialogue-characters"
        aria-label={t("Персонажи сценария")}
      >
        <h3>{t("Персонажи")}</h3>
        <button aria-pressed={all} onClick={() => onCharacter(true)}>
          <span>{t("Все персонажи")}</span>
          <small>
            {[...index.values()].reduce(
              (count, rows) => count + rows.length,
              0,
            )}
          </small>
        </button>
        {characters.map((character) => (
          <button
            key={character}
            aria-pressed={!all && character === characterName(name)}
            onClick={() => onCharacter(character)}
          >
            <span>{character}</span>
            <small>{index.get(character).length}</small>
          </button>
        ))}
      </nav>
      <div className="character-dialogue-content" key={name}>
        <div className="character-dialogue-heading">
          <div>
            <h2>{all ? t("Все персонажи") : name}</h2>
            <span>
              {all ? t("Реплики персонажей") : t("Реплики персонажа")} ·{" "}
              {rows.length}
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
            <p className="sidebar-empty">
              {t(
                all
                  ? "В сценарии пока нет реплик"
                  : "У персонажа пока нет реплик",
              )}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
