import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
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
  onImportLibrary,
}) {
  const language = useLanguage();
  const { isPro: IS_PRO } = useEdition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const active = useRef(null);
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
  useEffect(() => {
    setQuery("");
    requestAnimationFrame(() =>
      active.current?.scrollIntoView({
        block: "nearest",
      }),
    );
  }, [activeId, document.collapsedComponentFolders]);
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
      <div className="component-folders">
        {folders.map((folder) => {
          const items = document.components.filter(
            (c) =>
              (c.folderId || c.type) === folder.id &&
              `${c.name} ${c.description}`
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
                    <div
                      key={component.id}
                      ref={activeId === component.id ? active : null}
                      data-component-id={component.id}
                    >
                      <div
                        className={`component-row${activeId === component.id ? " active" : ""}`}
                      >
                        <button
                          className="component-item"
                          data-component-preview={component.id}
                          aria-expanded={activeId === component.id}
                          onClick={() =>
                            activeId === component.id
                              ? onCloseEdit()
                              : onEdit(component)
                          }
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
                          <ChevronDown
                            size={16}
                            className="component-arrow"
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      {activeId === component.id && renderEditor(component)}
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
          `${c.name} ${c.description}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        ) && <p className="sidebar-empty">{t("Ничего не найдено")}</p>}
    </aside>
  );
}
