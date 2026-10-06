import { t, useLanguage, languageLocale } from "./i18n.js";
import { useMemo } from "react";
import { X } from "lucide-react";
import { documentStatistics } from "./statistics.js";
const number = (value) => value.toLocaleString(languageLocale());
function Rows({ values }) {
  const language = useLanguage();
  return (
    <dl className="statistics-rows">
      {values.map(([label, value]) => (
        <div key={t(label)}>
          <dt>{t(label)}</dt>
          <dd>{typeof value === "number" ? number(value) : value}</dd>
        </div>
      ))}
    </dl>
  );
}
export default function StatisticsPanel({ document, pageCount, onClose }) {
  const language = useLanguage();
  const stats = useMemo(() => documentStatistics(document), [document]);
  return (
    <aside className="statistics-drawer" aria-label={t("Статистика документа")}>
      <div className="drawer-heading">
        <h2>{t("Статистика")}</h2>
        <button
          className="icon-button"
          aria-label={t("Закрыть статистику")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p className="statistics-title">{document.title}</p>
      <div className="statistics-scroll">
        <section
          className="statistics-overview"
          aria-label={t("Основные показатели")}
        >
          {[
            [t("Слов"), stats.words],
            [t("Сцен"), stats.scenes],
            [t("Персонажей"), stats.characters.length],
            [t("Страниц"), pageCount ?? stats.pages],
          ].map(([label, value]) => (
            <div key={t(label)}>
              <strong>{number(value)}</strong>
              <span>{t(label)}</span>
            </div>
          ))}
        </section>
        <section>
          <h3>{t("Текст")}</h3>
          <Rows
            values={[
              [t("Знаков с пробелами"), stats.charactersWithSpaces],
              [t("Знаков без пробелов"), stats.charactersWithoutSpaces],
              [t("Непустых абзацев"), stats.paragraphs],
              [t("Чтение ≈"), t("{0} мин", stats.readingMinutes)],
              [t("Хронометраж ≈"), t("{0} мин", pageCount ?? stats.pages)],
              [t("Слов в репликах"), stats.dialogueWords],
              [t("Доля реплик в словах"), `${stats.dialoguePercent}%`],
            ]}
          />
        </section>
        <section>
          <h3>{t("Сцены")}</h3>
          <Rows
            values={[
              [t("ИНТ. · интерьер"), stats.sceneTypes.interior],
              [t("ЭКС. · натура"), stats.sceneTypes.exterior],
              [t("ИНТ. / ЭКС. · смешанные"), stats.sceneTypes.mixed],
              [t("Другие заголовки"), stats.sceneTypes.other],
            ]}
          />
        </section>
        <section>
          <h3>{t("Типы абзацев")}</h3>
          <Rows values={stats.formats.map((f) => [f.label, f.count])} />
        </section>
        <section>
          <h3>{t("Персонажи и диалоги")}</h3>
          {stats.characters.length ? (
            <ul className="statistics-characters">
              {stats.characters.map((character) => (
                <li key={character.name}>
                  <div>
                    <span>{character.name}</span>
                    <strong>
                      {number(character.words)}
                      {t(" слов")}
                    </strong>
                  </div>
                  <span className="statistics-character-meta">
                    {t("Реплик: ")}
                    {number(character.speeches)}
                    {t(" · упоминаний в заголовках: ")}
                    {number(character.cues)}
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
              {t("Персонажи появятся после ввода их имён в формате Character.")}
            </p>
          )}
        </section>
        <section>
          <h3>{t("Компоненты и заметки")}</h3>
          <Rows
            values={[
              [t("Компонентов"), stats.components],
              [t("Персонажей-компонентов"), stats.characterComponents],
              [t("Мест"), stats.places],
              [t("Комментариев всего"), stats.comments],
              [t("Открытых"), stats.openComments],
              [t("Решённых"), stats.resolvedComments],
            ]}
          />
        </section>
        <p className="statistics-note">
          {t(
            "Хронометраж: 1 страница — 1 минута. Число страниц соответствует разметке редактора; чтение рассчитано по 200 слов в минуту.",
          )}
        </p>
        <p className="statistics-note">
          {t("Изменён: ")}
          {new Date(document.updatedAt).toLocaleString(languageLocale())}
        </p>
      </div>
    </aside>
  );
}
