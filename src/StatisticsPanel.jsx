import { useMemo } from "react";
import { X } from "lucide-react";
import { documentStatistics } from "./statistics.js";

const number = (value) => value.toLocaleString("ru-RU");
function Rows({ values }) {
  return (
    <dl className="statistics-rows">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{typeof value === "number" ? number(value) : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function StatisticsPanel({ document, pageCount, onClose }) {
  const stats = useMemo(() => documentStatistics(document), [document]);
  return (
    <aside className="statistics-drawer" aria-label="Статистика документа">
      <div className="drawer-heading">
        <h2>Статистика</h2>
        <button
          className="icon-button"
          aria-label="Закрыть статистику"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p className="statistics-title">{document.title}</p>
      <div className="statistics-scroll">
        <section
          className="statistics-overview"
          aria-label="Основные показатели"
        >
          {[
            ["Слов", stats.words],
            ["Сцен", stats.scenes],
            ["Персонажей", stats.characters.length],
            ["Страниц", pageCount ?? stats.pages],
          ].map(([label, value]) => (
            <div key={label}>
              <strong>{number(value)}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>
        <section>
          <h3>Текст</h3>
          <Rows
            values={[
              ["Знаков с пробелами", stats.charactersWithSpaces],
              ["Знаков без пробелов", stats.charactersWithoutSpaces],
              ["Непустых абзацев", stats.paragraphs],
              ["Чтение ≈", `${stats.readingMinutes} мин`],
              ["Хронометраж ≈", `${pageCount ?? stats.pages} мин`],
              ["Слов в репликах", stats.dialogueWords],
              ["Доля реплик в словах", `${stats.dialoguePercent}%`],
            ]}
          />
        </section>
        <section>
          <h3>Сцены</h3>
          <Rows
            values={[
              ["ИНТ. · интерьер", stats.sceneTypes.interior],
              ["ЭКС. · натура", stats.sceneTypes.exterior],
              ["ИНТ. / ЭКС. · смешанные", stats.sceneTypes.mixed],
              ["Другие заголовки", stats.sceneTypes.other],
            ]}
          />
        </section>
        <section>
          <h3>Типы абзацев</h3>
          <Rows values={stats.formats.map((f) => [f.label, f.count])} />
        </section>
        <section>
          <h3>Персонажи и диалоги</h3>
          {stats.characters.length ? (
            <ul className="statistics-characters">
              {stats.characters.map((character) => (
                <li key={character.name}>
                  <div>
                    <span>{character.name}</span>
                    <strong>{number(character.words)} слов</strong>
                  </div>
                  <span className="statistics-character-meta">
                    Реплик: {number(character.speeches)} · упоминаний в
                    заголовках: {number(character.cues)}
                  </span>
                  <div className="statistics-meter" aria-hidden="true">
                    <span
                      style={{
                        width: `${stats.dialogueWords ? (character.words / stats.dialogueWords) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="statistics-note">
              Персонажи появятся после ввода их имён в формате Character.
            </p>
          )}
        </section>
        <section>
          <h3>Компоненты и заметки</h3>
          <Rows
            values={[
              ["Компонентов", stats.components],
              ["Персонажей-компонентов", stats.characterComponents],
              ["Мест", stats.places],
              ["Комментариев всего", stats.comments],
              ["Открытых", stats.openComments],
              ["Решённых", stats.resolvedComments],
            ]}
          />
        </section>
        <p className="statistics-note">
          Хронометраж: 1 страница — 1 минута. Число страниц соответствует
          разметке редактора; чтение рассчитано по 200 слов в минуту.
        </p>
        <p className="statistics-note">
          Изменён: {new Date(document.updatedAt).toLocaleString("ru-RU")}
        </p>
      </div>
    </aside>
  );
}
