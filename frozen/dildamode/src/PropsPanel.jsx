import { t, useLanguage } from "./i18n.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Box,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  X,
  FolderPlus,
  Trash2,
} from "lucide-react";
import { propOccurrences } from "./prop-matches.js";
import { ThumbnailImage } from "./ThumbnailField.jsx";
import "./component-detail.css";
export default function PropsPanel({
  document,
  activeId,
  onClose,
  onCreate,
  onEdit,
  onCloseEdit,
  onAddFolder,
  onToggleFolder,
  onDeleteFolder,
  renderEditor,
}) {
  useLanguage();
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
  const previousActive = useRef(null);
  const rowButtons = useRef(new Map());
  const list = useRef(null);
  const listScroll = useRef(0);
  const selected = document.props.find((item) => item.id === activeId);
  useLayoutEffect(() => {
    if (selected || !list.current) return;
    const element = list.current;
    element.scrollTop = listScroll.current;
    const rememberScroll = () => {
      listScroll.current = element.scrollTop;
    };
    element.addEventListener("scroll", rememberScroll);
    return () => element.removeEventListener("scroll", rememberScroll);
  }, [!!selected]);
  useEffect(() => {
    if (activeId) {
      previousActive.current = activeId;
      return;
    }
    const button = rowButtons.current.get(previousActive.current);
    if (!button) return;
    button.focus({ preventScroll: true });
    previousActive.current = null;
  }, [activeId]);
  const items = document.props.filter((item) =>
    `${item.name} ${item.description}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  if (selected)
    return (
      <aside
        className="components-drawer props-drawer component-detail-drawer"
        aria-label={t("Реквизит сценария")}
        data-prop-id={selected.id}
      >
        <div className="drawer-heading component-detail-heading">
          <button
            type="button"
            className="icon-button"
            aria-label={t("Назад")}
            data-tooltip={t("Назад")}
            onClick={onCloseEdit}
          >
            <ArrowLeft size={18} />
          </button>
          <h2>{selected.name}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={t("Закрыть реквизит")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="component-detail-scroll">{renderEditor(selected)}</div>
      </aside>
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
      <div className="component-folders" ref={list}>
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
                  <div key={item.id} data-prop-id={item.id}>
                    <div
                      className={`component-row${item.id === activeId ? " active" : ""}`}
                    >
                      <button
                        type="button"
                        className="component-item"
                        ref={(button) => {
                          if (button) rowButtons.current.set(item.id, button);
                          else rowButtons.current.delete(item.id);
                        }}
                        data-prop-preview={item.id}
                        onClick={() => {
                          listScroll.current = list.current?.scrollTop || 0;
                          onEdit(item);
                        }}
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
                        <ChevronRight
                          size={16}
                          className="component-arrow"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
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
