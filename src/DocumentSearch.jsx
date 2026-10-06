import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useMemo, useRef } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { nodeText } from "./data.js";
import { FORMATS } from "./FormatBar.jsx";
export default function DocumentSearch({
  content,
  query,
  onQuery,
  index,
  onSelect,
  onClose,
}) {
  const language = useLanguage();
  const input = useRef(null),
    active = useRef(null);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    const results = [];
    for (const [blockIndex, block] of (content?.content || []).entries()) {
      const text = nodeText(block),
        lower = text.toLocaleLowerCase();
      let at = lower.indexOf(needle);
      while (at !== -1) {
        results.push({
          text,
          at,
          length: needle.length,
          blockIndex,
          format: block.attrs?.format,
        });
        at = lower.indexOf(needle, at + needle.length);
      }
    }
    return results;
  }, [content, query]);
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
          const start = Math.max(0, match.at - 50),
            end = Math.min(match.text.length, match.at + match.length + 80);
          return (
            <button
              key={`${match.blockIndex}-${match.at}`}
              ref={i === index ? active : null}
              className={`search-result-card${i === index ? " active" : ""}`}
              aria-pressed={i === index}
              onClick={() => onSelect(i, "card")}
            >
              <span className="search-result-meta">
                {FORMATS.find((f) => f[0] === match.format)?.[2] || t("Текст")}
                <span>{i + 1}</span>
              </span>
              <span>
                {start > 0 ? "…" : ""}
                {match.text.slice(start, match.at)}
                <mark>
                  {match.text.slice(match.at, match.at + match.length)}
                </mark>
                {match.text.slice(match.at + match.length, end)}
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
