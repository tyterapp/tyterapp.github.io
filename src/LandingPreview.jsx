import { t } from "./i18n.js";
import {
  Download,
  Search,
  Shapes,
  ChartNoAxesColumn,
  Box,
  Settings2,
  History,
  FolderOpen,
} from "lucide-react";
export default function LandingPreview({ panel }) {
  if (panel === t("Аутлайн · Pro"))
    return (
      <div
        className="landing-outline-preview"
        aria-label={t("Карточки аутлайна")}
      >
        {[t("Завязка"), t("Развитие"), t("Развязка")].map((act, index) => (
          <section key={act}>
            <strong>
              {t("Акт ")}
              {index + 1}
            </strong>
            {[
              act,
              [t("Незваный гость"), t("Поиски ответа"), t("Возвращение домой")][
                index
              ],
            ].map((title) => (
              <article key={t(title)}>
                <strong>▣ {t(title)}</strong>
                <p>
                  {
                    [
                      t(
                        "Кошка замечает открытое окно. На улице начинается новая история.",
                      ),
                      t(
                        "Анна ищет кошку в городе и встречает того, кто знает дорогу.",
                      ),
                      t(
                        "Квартира снова полна света. Кошка возвращается домой.",
                      ),
                    ][index]
                  }
                </p>
              </article>
            ))}
          </section>
        ))}
      </div>
    );
  if (panel === t("Файлы TYT · Pro"))
    return (
      <div
        className="landing-tyt-preview"
        aria-label={t("Проект Tyter в одном файле")}
      >
        <div className="landing-tyt-file">
          <FolderOpen size={38} />
          <strong>{t("Глазами кошки.tyt")}</strong>
          <span>{t("Вся история в одном файле")}</span>
        </div>
        <div className="landing-tyt-items">
          {[
            t("Сценарий"),
            t("Аутлайн"),
            t("Комментарии"),
            t("Компоненты"),
            t("Реквизит"),
            t("Обложка и авторство"),
          ].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    );
  return (
    <div
      className={`landing-preview ${panel ? "with-panel" : ""}`}
      aria-label={
        panel
          ? t("Предпросмотр: {0}", panel)
          : t("Предпросмотр редактора Tyter")
      }
    >
      <div className="preview-top">
        <span>
          <img src="/brand/tyter-logo.svg" alt="" />
          {t("Глазами кошки ")}
          <small>⌄</small>
          <FolderOpen size={13} />
        </span>
        <span>
          {[
            Search,
            ChartNoAxesColumn,
            Shapes,
            Box,
            Settings2,
            History,
            Download,
          ].map((Icon, i) => (
            <Icon key={i} size={13} />
          ))}
        </span>
      </div>
      <div className="preview-workspace">
        <div className="preview-paper">
          <small className="preview-number">1</small>
          <b>{t("ИНТ. КВАРТИРА — УТРО")}</b>
          <p>
            {t(
              "Кошка наблюдает за городом с подоконника. Внизу спешат люди, а на кухне тихо звенит пустая миска.",
            )}
          </p>
          <div className="preview-dialogue">
            <b>{t("КОШКА")}</b>
            <br />
            {t("Кажется, у них опять свои планы на завтрак.")}
          </div>
          <b>{t("ИНТ. КВАРТИРА — ДЕНЬ")}</b>
          <p>
            <span
              className={
                panel === t("Реквизит") ? "preview-orange" : "preview-blue"
              }
            >
              {t("Миска")}
            </span>{" "}
            {t("всё ещё пуста. Анна открывает дверь.")}
          </p>
        </div>
        {panel && (
          <aside className="preview-panel">
            <strong>{panel}</strong>
            {panel === t("Компоненты") ? (
              <>
                <small>{t("Персонажи")}</small>
                <div>
                  {t("♧ Анна ")}
                  <small>{t("Главная героиня")}</small>
                </div>
                <div>
                  {t("♧ Кошка ")}
                  <small>{t("Внимательный наблюдатель")}</small>
                </div>
                <small>{t("Места")}</small>
                <div>{t("♧ Квартира")}</div>
              </>
            ) : panel === t("Статистика") ? (
              <>
                <div className="preview-metrics">
                  <b>
                    12<small>{t("страниц")}</small>
                  </b>
                  <b>
                    {t("12 мин")}
                    <small>{t("хронометраж")}</small>
                  </b>
                  <b>
                    8<small>{t("сцен")}</small>
                  </b>
                  <b>
                    24<small>{t("реплики")}</small>
                  </b>
                </div>
                <small>{t("Доля диалогов")}</small>
                <div className="preview-chart">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <small>
                  {t("Кошка · 14 реплик")}
                  <br />
                  {t("Анна · 10 реплик")}
                </small>
              </>
            ) : panel === t("Реквизит") ? (
              <>
                <div>
                  {t("▧ Миска ")}
                  <small>{t("1 шт. · В тексте: 3")}</small>
                </div>
                <div>
                  {t("▧ Ключи ")}
                  <small>{t("1 шт. · В тексте: 2")}</small>
                </div>
                <div>
                  {t("▧ Телефон ")}
                  <small>{t("1 шт. · В тексте: 4")}</small>
                </div>
                <span className="preview-report">{t("↓ Отчёт в PDF")}</span>
              </>
            ) : (
              <>
                <div>
                  {t("Сегодня, 12:42")}
                  <small>{t("Изменён текст сценария")}</small>
                </div>
                <div>
                  {t("Сегодня, 12:30")}
                  <small>{t("Добавлен компонент «Анна»")}</small>
                </div>
                <div>
                  {t("Вчера, 18:15")}
                  <small>{t("Первая сцена")}</small>
                </div>
                <small>{t("История хранится на устройстве")}</small>
              </>
            )}
          </aside>
        )}
      </div>
      <div className="preview-format-bar">
        {[
          "scene",
          "action",
          "character",
          "speech",
          "parenthetical",
          "transition",
          "plain",
          "comments",
        ].map((key, i) => (
          <span className={i === 0 ? "active" : ""} key={key}>
            <img src={`/icons/format/${key}.svg`} alt="" />
          </span>
        ))}
      </div>
    </div>
  );
}
