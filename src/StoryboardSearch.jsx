import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Image } from "lucide-react";
import { useLanguage } from "./i18n.js";
import { Shape } from "./StoryboardCanvas.jsx";
import { shotAspectRatio } from "./shot-image.js";
import { storyboardSearchMatches } from "./storyboard-search.js";
import "./storyboard-search.css";

const PAGE_SIZE = 60;

export default function StoryboardSearch({
  scenes,
  query,
  onQuery,
  onClose,
  onOpenFrame,
  onSelectScene,
  selectedSceneId,
  selectedFrameId,
  scopeControl,
}) {
  const language = useLanguage();
  const tr = (ru, en) => (language === "en" ? en : ru);
  const input = useRef(null);
  const [page, setPage] = useState({ query, count: PAGE_SIZE });
  const count = page.query === query ? page.count : PAGE_SIZE;
  const matches = useMemo(
    () => storyboardSearchMatches(scenes, query, language),
    [scenes, query, language],
  );
  useEffect(() => {
    input.current?.focus();
  }, []);
  const open = (match) => {
    if (match.frameId && onOpenFrame)
      onOpenFrame(match.sceneId, match.frameId, match.variant);
    else onSelectScene?.(match.sceneId, match.variant);
  };

  return (
    <aside
      className="search-drawer storyboard-search"
      aria-label={tr("Поиск раскадровки", "Storyboard search")}
    >
      <div className="drawer-heading">
        <h2>{tr("Поиск", "Search")}</h2>
        <button
          className="icon-button"
          aria-label={tr("Закрыть поиск", "Close search")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {scopeControl}
      <label className="sidebar-search">
        <Search size={15} />
        <input
          ref={input}
          aria-label={tr("Поиск по раскадровке", "Search storyboard")}
          placeholder={tr("Найти сцену или кадр…", "Find a scene or frame…")}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter" && matches.length) {
              event.preventDefault();
              open(matches[0]);
            }
          }}
        />
      </label>
      <p
        className="storyboard-search__summary"
        aria-live="polite"
        role="status"
      >
        {query.trim()
          ? matches.length
            ? tr(`Найдено: ${matches.length}`, `Results: ${matches.length}`)
            : tr("Нет совпадений", "No matches")
          : tr("Сцены, кадры и комментарии", "Scenes, frames and comments")}
      </p>
      <div className="storyboard-search__results">
        {matches.slice(0, count).map((match) => {
          const layers = (match.frame?.layers || []).filter(
            (layer) => layer.visible !== false,
          );
          const start = Math.max(0, match.at - 35);
          const end = Math.min(match.text.length, match.at + match.length + 60);
          const active =
            selectedSceneId === match.sceneId &&
            selectedFrameId === match.frameId;
          return (
            <button
              key={match.key}
              className={`storyboard-search__card${active ? " storyboard-search__card--active" : ""}`}
              aria-pressed={active}
              data-scene-id={match.sceneId}
              data-frame-id={match.frameId || ""}
              data-scene-variant={match.variant}
              data-page-number={match.pageNumber}
              onClick={() => open(match)}
            >
              <span className="storyboard-search__context">
                {match.context}
              </span>
              <span className="storyboard-search__body">
                <span
                  className="storyboard-search__thumbnail"
                  style={{
                    aspectRatio: shotAspectRatio(match.aspectRatio) || 16 / 9,
                  }}
                  aria-hidden="true"
                >
                  {match.frame?.image && (
                    <img
                      className="storyboard-search__image"
                      src={match.frame.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  {layers.length > 0 && (
                    <svg
                      className="storyboard-search__drawing"
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                    >
                      {layers.map((layer) => (
                        <Shape key={layer.id} layer={layer} />
                      ))}
                    </svg>
                  )}
                  {!match.frame?.image && !layers.length && (
                    <Image
                      className="storyboard-search__placeholder"
                      size={20}
                    />
                  )}
                </span>
                <span className="storyboard-search__details">
                  <strong className="storyboard-search__title">
                    {match.title}
                  </strong>
                  <span className="storyboard-search__field">
                    {match.fieldLabel}
                  </span>
                  <span className="storyboard-search__excerpt">
                    {start ? "…" : ""}
                    {match.text.slice(start, match.at)}
                    <mark className="storyboard-search__highlight">
                      {match.text.slice(match.at, match.at + match.length)}
                    </mark>
                    {match.text.slice(match.at + match.length, end)}
                    {end < match.text.length ? "…" : ""}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
        {matches.length > count && (
          <button
            className="storyboard-search__more"
            onClick={() => setPage({ query, count: count + PAGE_SIZE })}
          >
            {tr("Показать ещё", "Show more")} (
            {Math.min(PAGE_SIZE, matches.length - count)})
          </button>
        )}
        {!query.trim() && (
          <p className="storyboard-search__empty">
            {tr(
              "Введите название, параметр съёмки или текст комментария.",
              "Enter a title, shot setting or comment text.",
            )}
          </p>
        )}
        {query.trim() && !matches.length && (
          <p className="storyboard-search__empty">
            {tr(
              "Попробуйте другое слово или откройте поиск по сценарию.",
              "Try another word or switch to screenplay search.",
            )}
          </p>
        )}
      </div>
    </aside>
  );
}
