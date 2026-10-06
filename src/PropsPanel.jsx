import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useRef, useState } from "react";
import { Box, ChevronDown, Plus, Search, X, Download } from "lucide-react";
import { propOccurrences } from "./prop-matches.js";
import { ThumbnailImage } from "./ThumbnailField.jsx";
export default function PropsPanel({
  document,
  activeId,
  onClose,
  onCreate,
  onEdit,
  onCloseEdit,
  onExport,
  renderEditor,
}) {
  const language = useLanguage();
  const [query, setQuery] = useState("");
  const active = useRef(null);
  useEffect(() => {
    setQuery("");
    requestAnimationFrame(() =>
      active.current?.scrollIntoView({
        block: "nearest",
      }),
    );
  }, [activeId]);
  const items = document.props.filter((item) =>
    `${item.name} ${item.description}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <aside
      className="components-drawer props-drawer"
      aria-label={t("Реквизит сценария")}
    >
      <div className="drawer-heading">
        <h2>{t("Реквизит")}</h2>
        <div className="drawer-tools">
          <button
            className="icon-button"
            aria-label={t("Скачать отчёт реквизита")}
            data-tooltip={t("Отчёт реквизита · PDF")}
            onClick={onExport}
          >
            <Download size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Добавить реквизит")}
            data-tooltip={t("Новый реквизит")}
            onClick={() => onCreate({})}
          >
            <Plus size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Закрыть реквизит")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <label className="sidebar-search">
        <Search size={15} />
        <input
          aria-label={t("Поиск реквизита")}
          placeholder={t("Найти реквизит…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="component-folders">
        {items.map((item) => (
          <div
            key={item.id}
            ref={item.id === activeId ? active : null}
            data-prop-id={item.id}
          >
            <div
              className={`component-row${item.id === activeId ? " active" : ""}`}
            >
              <button
                className="component-item"
                data-prop-preview={item.id}
                aria-expanded={item.id === activeId}
                onClick={() =>
                  item.id === activeId ? onCloseEdit() : onEdit(item)
                }
              >
                {item.thumbnail ? (
                  <ThumbnailImage src={item.thumbnail} name={item.name} />
                ) : (
                  <Box size={16} />
                )}
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.quantity}
                    {t(" шт. · В тексте:")}{" "}
                    {propOccurrences(document.content, item.name)}
                  </small>
                </span>
                <ChevronDown size={16} className="component-arrow" />
              </button>
            </div>
            {item.id === activeId && renderEditor(item)}
          </div>
        ))}
        {!items.length && (
          <p className="sidebar-empty">
            {query ? t("Ничего не найдено") : t("Пока нет реквизита")}
          </p>
        )}
      </div>
    </aside>
  );
}
