import { useEffect, useRef, useState } from "react";
import { LibraryBig, Upload, X, Link2, Unlink, Download } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import {
  localComponentLibraries,
  libraryFromDocument,
  exportComponentLibrary,
  readComponentLibrary,
} from "./component-library.js";

import { saveBlob } from "./exports.js";

export default function ComponentLibraryDialog({
  mobile = false,
  screenplay,
  onDetach,
  discovered = [],
  onClose,
  onEmbed,
}) {
  useLanguage();
  const file = useRef(null);
  const dialog = useRef(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    const element = dialog.current;
    if (mobile) element.showModal();
    const siblings = mobile
      ? []
      : [...element.closest(".minimal-app").children].filter(
          (item) => !item.contains(element),
        );
    const states = siblings.map((item) => item.inert);
    siblings.forEach((item) => {
      item.inert = true;
    });
    dialog.current.querySelector("button")?.focus({ preventScroll: true });
    const trap = (event) => {
      if (event.key !== "Tab") return;
      const controls = [
        ...dialog.current.querySelectorAll(
          "button:not([disabled]), input:not([hidden]):not([disabled])",
        ),
      ];
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap, true);
    return () => {
      mounted.current = false;
      if (mobile) element.close();
      siblings.forEach((item, index) => {
        item.inert = states[index];
      });
      document.removeEventListener("keydown", trap, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [mobile]);
  const local = libraryFromDocument(screenplay);
  const linked = new Map();
  for (const component of screenplay.components) {
    const source = component.librarySource;
    if (!source) continue;
    if (!linked.has(source.libraryId))
      linked.set(source.libraryId, {
        ...local,
        id: source.libraryId,
        name: source.name,
        components: [],
      });
    linked
      .get(source.libraryId)
      .components.push({ ...component, id: source.componentId });
  }
  const [libraries, setLibraries] = useState(discovered);
  const [chosenId, setChosenId] = useState(
    discovered[0]?.id || "current-local",
  );
  const initialSelection = (library) => {
    const connected = screenplay.components.filter(
      (c) => c.librarySource?.libraryId === library?.id,
    );
    return connected.length
      ? connected
          .filter((c) => c.enabled !== false)
          .map((c) => c.librarySource.componentId)
      : library?.components.map((c) => c.id) || [];
  };
  const [selected, setSelected] = useState(
    discovered[0]
      ? initialSelection(discovered[0])
      : local.components.map((c) => c.id),
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const all = [
    ...libraries,
    ...[...linked.values()].filter(
      (lib) => !libraries.some((item) => item.id === lib.id),
    ),
  ];
  const isLocal = chosenId === "current-local";
  const chosen = isLocal ? local : all.find((lib) => lib.id === chosenId);
  const connected = !isLocal && linked.has(chosenId);
  const choose = (id) => {
    setChosenId(id);
    setSelected(
      id === "current-local"
        ? local.components.map((c) => c.id)
        : initialSelection(all.find((lib) => lib.id === id)),
    );
    setError("");
  };
  useEffect(() => {
    let cancelled = false;
    localComponentLibraries()
      .then((stored) => {
        if (!cancelled)
          setLibraries((list) => [
            ...list,
            ...stored.filter((lib) => !list.some((item) => item.id === lib.id)),
          ]);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось открыть локальные библиотеки.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setError("");
    setBusy(true);
    try {
      const loaded = [];
      for (const file of files) {
        if (file.size > 50 * 1024 * 1024)
          throw new Error("Библиотека слишком большая: максимум 50 МБ.");
        loaded.push(readComponentLibrary(await file.text()));
      }
      if (!loaded.length) return;
      const last = loaded.at(-1);
      setLibraries((existing) => [
        ...loaded,
        ...existing.filter((lib) => !loaded.some((d) => d.id === lib.id)),
      ]);
      setChosenId(last.id);
      setSelected(initialSelection(last));
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const embed = async () => {
    setBusy(true);
    setError("");
    try {
      await localComponentLibraries(chosen);
      if (!mounted.current) return;
      if (onEmbed(chosen, selected) !== false) onClose();
    } catch {
      setError("Не удалось сохранить библиотеку на устройстве.");
    } finally {
      setBusy(false);
    }
  };
  const download = () =>
    saveBlob(
      exportComponentLibrary(screenplay, selected),
      screenplay.title || "Library",
      "tytl",
    );
  const Wrapper = mobile ? "dialog" : "section";
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <Wrapper
        ref={dialog}
        className="minimal-dialog library-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Библиотеки компонентов")}
        onCancel={
          mobile
            ? (event) => {
                event.preventDefault();
                if (!busy) onClose();
              }
            : undefined
        }
      >
        <div className="dialog-heading">
          <h2>
            <LibraryBig size={20} />
            {t("Библиотеки компонентов")}
          </h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Закрыть библиотеки")}
          >
            <X size={18} />
          </button>
        </div>
        <p className="settings-hint">
          {t(
            discovered.length
              ? "В выбранной папке найдены библиотеки. Выберите компоненты для этого сценария."
              : "Загрузите библиотеку с компьютера или выберите сохранённую на этом устройстве.",
          )}
        </p>
        <button
          className="quiet-button"
          onClick={() => file.current.click()}
          disabled={busy}
        >
          <Upload size={16} />
          {t("Загрузить библиотеку")}
        </button>
        <input
          ref={file}
          type="file"
          accept=".tytl,.tyt,.json"
          multiple
          hidden
          onChange={upload}
        />
        <div className="library-browser">
          <div className="library-list">
            <button
              className={isLocal ? "selected" : ""}
              aria-pressed={isLocal}
              aria-label={t("Библиотека текущего документа")}
              onClick={() => choose("current-local")}
            >
              <LibraryBig size={16} />
              <span>
                {t("Текущий документ")}
                <small>
                  {screenplay.title} · {local.components.length}
                </small>
              </span>
            </button>
            {all.map((library) => (
              <button
                className={chosenId === library.id ? "selected" : ""}
                aria-pressed={chosenId === library.id}
                key={library.id}
                onClick={() => choose(library.id)}
              >
                <LibraryBig size={16} />
                <span>
                  {library.name}
                  <small>
                    {library.components.length}
                    {linked.has(library.id) ? " · " + t("Подключена") : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <div className="library-components">
            {chosen && (
              <>
                <div className="library-component-controls">
                  <label>
                    <input
                      type="checkbox"
                      aria-label={t(
                        isLocal
                          ? "Выбрать все для экспорта"
                          : "Включить все компоненты",
                      )}
                      ref={(input) => {
                        if (input)
                          input.indeterminate =
                            selected.length > 0 &&
                            selected.length < chosen.components.length;
                      }}
                      checked={
                        !!chosen.components.length &&
                        chosen.components.every((c) => selected.includes(c.id))
                      }
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? chosen.components.map((c) => c.id)
                            : [],
                        )
                      }
                    />
                    <span>{t(isLocal ? "Для экспорта" : "В сценарии")}</span>
                  </label>
                  {connected && (
                    <button
                      className="quiet-button"
                      data-tooltip={t(
                        "Компоненты станут локальными и будут доступны в сценарии.",
                      )}
                      onClick={() => {
                        onDetach(chosenId);
                        choose("current-local");
                      }}
                    >
                      <Unlink size={15} />
                      {t("Отвязать библиотеку")}
                    </button>
                  )}
                </div>
                {chosen.components.map((component) => (
                  <label key={component.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(component.id)}
                      onChange={(event) =>
                        setSelected((ids) =>
                          event.target.checked
                            ? [...ids, component.id]
                            : ids.filter((id) => id !== component.id),
                        )
                      }
                    />
                    {(!isLocal ||
                      screenplay.components.find((c) => c.id === component.id)
                        ?.librarySource) && <Link2 size={14} />}
                    <span>
                      {component.name}
                      <small>{component.description}</small>
                    </span>
                  </label>
                ))}
                {!chosen.components.length && (
                  <p className="sidebar-empty">{t("Пока нет компонентов")}</p>
                )}
              </>
            )}
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="dialog-actions">
          <button className="quiet-button" onClick={onClose}>
            {t("Закрыть")}
          </button>
          {isLocal ? (
            <button
              className="primary-button"
              disabled={!selected.length}
              onClick={download}
            >
              <Download size={16} />
              {t("Скачать библиотеку")}
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={busy || !chosen || (!connected && !selected.length)}
              onClick={embed}
            >
              {t(connected ? "Применить" : "Внедрить в сценарий")}
            </button>
          )}
        </div>
      </Wrapper>
    </div>
  );
}
