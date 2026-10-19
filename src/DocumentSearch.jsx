import { t, useLanguage } from "./i18n.js";
import { useEffect, useRef } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { FORMATS } from "./FormatBar.jsx";
import { searchMatchKey } from "./document-search.js";
import { scriptVersionSwatchStyle } from "./script-version-colors.js";
import ScriptVersionIcon from "./ScriptVersionIcon.jsx";
export default function DocumentSearch({
  hideFormat = false,
  matches,
  query,
  onQuery,
  format,
  onFormat,
  index,
  onSelect,
  onClose,
}) {
  const language = useLanguage();
  const input = useRef(null),
    active = useRef(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    active.current?.scrollIntoView({
      block: "nearest",
    });
  }, [index]);
  const move = (delta) =>
    matches.length &&
    onSelect((index + delta + matches.length) % matches.length);
  return (
    <aside className="search-drawer" aria-label={t("Поиск по сценарию")}>
      <div className="drawer-heading">
        <h2>{t("Поиск")}</h2>
        <button
          className="icon-button"
          aria-label={t("Закрыть поиск")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <label className="sidebar-search">
        <Search size={15} />
        <input
          ref={input}
          aria-label={t("Поиск по тексту")}
          placeholder={t("Найти в сценарии…")}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              move(e.shiftKey ? -1 : 1);
            }
            if (e.key === "Escape") onClose();
          }}
        />
      </label>
      {!hideFormat && (
        <label className="search-format-filter">
          <span>{t("Формат текста")}</span>
          <select
            value={format}
            onChange={(event) => onFormat(event.target.value)}
          >
            <option value="all">{t("Все форматы")}</option>
            {FORMATS.map(([key, , label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="search-summary">
        <span className="search-count">
          {matches.length
            ? `${index + 1} / ${matches.length}`
            : query
              ? t("Нет совпадений")
              : "0 / 0"}
        </span>
        <div>
          <button
            className="icon-button"
            aria-label={t("Предыдущее совпадение")}
            disabled={!matches.length}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Следующее совпадение")}
            disabled={!matches.length}
            onClick={() => move(1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="search-results">
        {matches.map((match, i) => {
          const matchedFormat = FORMATS.find(([key]) => key === match.format);
          const at = match.at - (match.textOffset || 0);
          const start = Math.max(0, at - 50),
            end = Math.min(match.text.length, at + match.length + 80);
          return (
            <button
              key={searchMatchKey(match)}
              ref={i === index ? active : null}
              className={`search-result-card${i === index ? " active" : ""}`}
              aria-pressed={i === index}
              data-script-version={match.versionId}
              data-page-id={match.pageId}
              data-page-number={match.pageNumber}
              onClick={() => onSelect(i, "card")}
            >
              <span className="search-result-meta">
                <span className="search-result-format">
                  <img
                    className="format-bar-icon search-result-format-icon"
                    src={`/icons/format/${matchedFormat?.[0] || "plain"}.svg`}
                    alt=""
                    aria-hidden="true"
                  />
                  {t(matchedFormat?.[2] || "Текст")}
                </span>
                <span className="search-result-page">
                  {match.pageNumber
                    ? `${language === "en" ? "Page" : "Стр."} ${match.pageNumber}`
                    : i + 1}
                </span>
              </span>
              {(match.versionLabel || match.variant) && (
                <span className="search-result-context">
                  {match.versionLabel && (
                    <span
                      className="search-version-badge"
                      style={scriptVersionSwatchStyle(match.versionId)}
                    >
                      <ScriptVersionIcon
                        versionId={match.versionId}
                        size={13}
                      />
                      {match.versionLabel}
                    </span>
                  )}
                  {match.variant && (
                    <span
                      className={`search-variant-badge${match.variants.length > 1 ? " has-variants" : ""}`}
                      aria-label={t("Варианты сцены")}
                    >
                      {match.variant}
                      {match.variants.length > 1
                        ? ` · ${match.variants.join(" / ")}`
                        : ""}
                    </span>
                  )}
                </span>
              )}
              <span>
                {start > 0 ? "…" : ""}
                {match.text.slice(start, at)}
                <mark>{match.text.slice(at, at + match.length)}</mark>
                {match.text.slice(at + match.length, end)}
                {end < match.text.length ? "…" : ""}
              </span>
            </button>
          );
        })}
        {!query && (
          <p className="sidebar-empty">
            {t(
              "Введите слово или фразу, чтобы найти все совпадения в документе.",
            )}
          </p>
        )}
      </div>
    </aside>
  );
}
