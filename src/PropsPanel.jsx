import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useRef, useState } from "react";
import {
  Box,
  ChevronDown,
  Plus,
  Search,
  X,
  Download,
  FolderPlus,
  Trash2,
} from "lucide-react";
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
  onAddFolder,
  onToggleFolder,
  onDeleteFolder,
  renderEditor,
}) {
  const language = useLanguage();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const folders = [
    { id: "", name: t("Без папки") },
    ...(document.propFolders || []),
  ];
  const collapsed = document.collapsedPropFolders || [];
  const duplicate = folders.some(
    (folder) =>
      folder.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
  );
  const active = useRef(null);
  useEffect(() => {
    setQuery("");
    requestAnimationFrame(() =>
      active.current?.scrollIntoView({
        block: "nearest",
      }),
    );
  }, [activeId, document.collapsedPropFolders]);
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
            aria-label={t("Создать папку реквизита")}
            data-tooltip={t("Новая папка")}
            onClick={() => setAdding((value) => !value)}
          >
            <FolderPlus size={17} />
          </button>
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
      {adding && (
        <form
          className="new-component-folder"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || duplicate) return;
            onAddFolder(name.trim());
            setName("");
            setAdding(false);
          }}
        >
          <input
            autoFocus
            aria-label={t("Название папки")}
            placeholder={t("Название папки")}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            className="icon-button"
            aria-label={t("Добавить папку")}
            disabled={!name.trim() || duplicate}
          >
            <Plus size={17} />
          </button>
        </form>
      )}
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
        {folders.map((folder) => {
          const grouped = items.filter(
            (item) => (item.folderId || "") === folder.id,
          );
          if (query.trim() && !grouped.length) return null;
          const closed = !query.trim() && collapsed.includes(folder.id);
          return (
            <section className="component-group" key={folder.id}>
              <div className="component-group-heading">
                <button
                  className="folder-toggle"
                  aria-label={t("Папка: {0}", folder.name)}
                  aria-expanded={!closed}
                  onClick={() => onToggleFolder(folder.id)}
                >
                  <ChevronDown
                    size={14}
                    className={closed ? "folder-closed" : ""}
                  />
                  <span>{folder.name}</span>
                  <small>{grouped.length}</small>
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Добавить: {0}", folder.name)}
                  onClick={() => onCreate({ folderId: folder.id || null })}
                >
                  <Plus size={17} />
                </button>
                {folder.id && (
                  <button
                    className="icon-button folder-delete"
                    aria-label={t("Удалить папку: {0}", folder.name)}
                    data-tooltip={t("Удалить папку")}
                    onClick={() => onDeleteFolder(folder)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              {!closed &&
                grouped.map((item) => (
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
                          <ThumbnailImage
                            src={item.thumbnail}
                            name={item.name}
                          />
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
            </section>
          );
        })}
        {!items.length && (
          <p className="sidebar-empty">
            {query ? t("Ничего не найдено") : t("Пока нет реквизита")}
          </p>
        )}
      </div>
    </aside>
  );
}
