import { t, useLanguage, languageLocale } from "./i18n.js";
import { ArrowLeft, Copy, ChartLine } from "lucide-react";
export default function OutlineHistoryPreview({ revision, onExit }) {
  const language = useLanguage();
  const outline = revision.snapshot.outline || {
    columns: [],
    cards: [],
  };
  return (
    <div
      className="outline-history-preview"
      aria-label={t("Аутлайн выбранной версии")}
    >
      <div className="history-preview-banner">
        <span>
          {t("Версия от")}{" "}
          {new Date(revision.createdAt).toLocaleString(languageLocale(), {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <button className="quiet-button" onClick={onExit}>
          <ArrowLeft size={14} />
          {t("К текущему аутлайну")}
        </button>
      </div>
      <div className="outline-columns">
        {outline.columns.map((column) => (
          <section className="outline-column" key={column.id}>
            <div className="outline-column-heading">
              <h2>{column.title}</h2>
            </div>
            <div className="outline-card-list">
              {outline.cards
                .filter((card) => card.columnId === column.id)
                .map((card) => (
                  <article className="outline-card" key={card.id}>
                    <div
                      className="outline-card-heading"
                      style={{
                        color: card.color,
                      }}
                    >
                      <Copy size={17} />
                      <strong>{card.title}</strong>
                    </div>
                    <p>{card.text || t("Без текста")}</p>
                    <small className="outline-drama-badge">
                      <ChartLine size={12} />
                      {card.drama || 0}/10
                    </small>
                    {!!card.comments?.length && (
                      <small>
                        {card.comments.length}
                        {t(" комментариев")}
                      </small>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))}
        {!outline.columns.length && (
          <p className="sidebar-empty">{t("В этой версии ещё нет актов.")}</p>
        )}
      </div>
    </div>
  );
}
