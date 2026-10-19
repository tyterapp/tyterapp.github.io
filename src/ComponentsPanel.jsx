import { t, useLanguage } from "./i18n.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  ClipboardList,
  LibraryBig,
  Link2,
  FolderPlus,
  Plus,
  Search,
  Shapes,
  Trash2,
  X,
} from "lucide-react";
import { useEdition } from "./edition.js";
import { ThumbnailImage } from "./ThumbnailField.jsx";
import { componentNames } from "./component-names.js";
import "./component-detail.css";
export default function ComponentsPanel({
  document,
  activeId,
  onClose,
  onEdit,
  onCloseEdit,
  onCreate,
  onToggleFolder,
  onAddFolder,
  onDeleteFolder,
  renderEditor,
  onExportLibrary,
  onExportReport,
  exporting,
  onImportLibrary,
}) {
  useLanguage();
  const { isPro: IS_PRO } = useEdition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const previousActive = useRef(null);
  const rowButtons = useRef(new Map());
  const list = useRef(null);
  const listScroll = useRef(0);
  const folders = [
    {
      id: "character",
      name: t("Персонажи"),
      type: "character",
    },
    {
      id: "place",
      name: t("Места"),
      type: "place",
    },
    ...(document.componentFolders || []),
  ];
  const collapsed = document.collapsedComponentFolders || [];
  const selected = document.components.find(
    (component) => component.id === activeId,
  );
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
  const reportAction = (
    <button
      type="button"
      className="component-report-export"
      aria-label={t("Скачать отчёт реквизита")}
      aria-busy={exporting || undefined}
      disabled={exporting || !document.components.length}
      onClick={onExportReport}
    >
      <ClipboardList size={18} aria-hidden="true" />
      <span>{t("Отчёт реквизита")}</span>
      <small>PDF</small>
    </button>
  );
  if (selected)
    return (
      <aside
        className="components-drawer component-detail-drawer"
        aria-label={t("Компоненты сценария")}
        data-component-id={selected.id}
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
            aria-label={t("Закрыть компоненты")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {reportAction}
        <div className="component-detail-scroll">{renderEditor(selected)}</div>
      </aside>
    );
  return (
    <aside className="components-drawer" aria-label={t("Компоненты сценария")}>
      <div className="drawer-heading">
        <h2>{t("Компоненты")}</h2>
        <div className="drawer-tools">
          <button
            className="icon-button"
            aria-label={t("Экспорт библиотеки компонентов")}
            data-tooltip={t("Экспорт библиотеки компонентов")}
            disabled={!document.components.length}
            onClick={onExportLibrary}
          >
            <Download size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Библиотеки компонентов")}
            data-tooltip={t("Библиотеки компонентов")}
            onClick={onImportLibrary}
          >
            <LibraryBig size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Создать папку компонентов")}
            data-tooltip={t("Новая папка")}
            onClick={() => setAdding((v) => !v)}
          >
            <FolderPlus size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Закрыть компоненты")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
      </div>
      {reportAction}
      {adding && (
        <form
          className="new-component-folder"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              name.trim() &&
              !folders.some(
                (f) =>
                  f.name.toLocaleLowerCase() ===
                  name.trim().toLocaleLowerCase(),
              )
            ) {
              onAddFolder(name.trim());
              setName("");
              setAdding(false);
            }
          }}
        >
          <input
            autoFocus
            aria-label={t("Название папки")}
            placeholder={t("Название папки")}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="icon-button"
            aria-label={t("Добавить папку")}
            disabled={
              !name.trim() ||
              folders.some(
                (f) =>
                  f.name.toLocaleLowerCase() ===
                  name.trim().toLocaleLowerCase(),
              )
            }
          >
            <Plus size={17} />
          </button>
        </form>
      )}
      <label className="sidebar-search">
        <Search size={15} />
        <input
          aria-label={t("Поиск компонентов")}
          placeholder={t("Найти компонент…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {!IS_PRO && (
        <p className="component-quota">
          {document.components.length}
          {t(" / 10 компонентов")}
        </p>
      )}
      <div className="component-folders" ref={list}>
        {folders.map((folder) => {
          const items = document.components.filter(
            (c) =>
              (c.folderId || c.type) === folder.id &&
              `${componentNames(c).join(" ")} ${c.description}`
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase()),
          );
          if (query.trim() && !items.length) return null;
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
                  <small>{items.length}</small>
                </button>
                <button
                  className="icon-button"
                  aria-label={t("Добавить: {0}", folder.name)}
                  onClick={() =>
                    onCreate({
                      type: folder.type || "character",
                      folderId: folder.type ? null : folder.id,
                    })
                  }
                >
                  <Plus size={17} />
                </button>
                {!folder.type && (
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
              {!closed && (
                <div>
                  {items.map((component) => (
                    <div key={component.id} data-component-id={component.id}>
                      <div
                        className={`component-row${activeId === component.id ? " active" : ""}`}
                      >
                        <button
                          type="button"
                          className="component-item"
                          ref={(button) => {
                            if (button)
                              rowButtons.current.set(component.id, button);
                            else rowButtons.current.delete(component.id);
                          }}
                          data-component-preview={component.id}
                          onClick={() => {
                            listScroll.current = list.current?.scrollTop || 0;
                            onEdit(component);
                          }}
                        >
                          {component.thumbnail ? (
                            <ThumbnailImage
                              src={component.thumbnail}
                              name={component.name}
                            />
                          ) : (
                            <Shapes
                              size={16}
                              className="component-color-icon"
                              style={{
                                "--component-color": component.color,
                              }}
                            />
                          )}
                          <span>
                            <strong>{component.name}</strong>
                            {component.description && (
                              <small>{component.description}</small>
                            )}
                          </span>
                          {component.librarySource && (
                            <Link2
                              className="component-library-link"
                              size={14}
                              aria-label={t("Встроенный компонент")}
                              data-tooltip={t(
                                "Библиотека: {0}",
                                component.librarySource.name,
                              )}
                            />
                          )}
                          <ChevronRight
                            size={16}
                            className="component-arrow"
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!items.length && (
                    <p className="empty-components">
                      {t("Пока нет компонентов")}
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {query.trim() &&
        !document.components.some((c) =>
          `${componentNames(c).join(" ")} ${c.description}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        ) && <p className="sidebar-empty">{t("Ничего не найдено")}</p>}
    </aside>
  );
}
