import { useEffect, useRef, useState } from "react";
import { LibraryBig, Upload, X, Link2 } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import {
  localComponentLibraries,
  readComponentLibrary,
} from "./component-library.js";

export default function ComponentLibraryDialog({
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
    const siblings = [
      ...dialog.current.closest(".minimal-app").children,
    ].filter((item) => !item.contains(dialog.current));
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
      siblings.forEach((item, index) => {
        item.inert = states[index];
      });
      document.removeEventListener("keydown", trap, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const [libraries, setLibraries] = useState(discovered),
    [chosen, setChosen] = useState(discovered[0] || null);
  const [selected, setSelected] = useState(
    discovered[0]?.components.map((c) => c.id) || [],
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    localComponentLibraries()
      .then((stored) => {
        if (cancelled) return;
        const all = [
          ...discovered,
          ...stored.filter((lib) => !discovered.some((d) => d.id === lib.id)),
        ];
        setLibraries(all);
        if (!chosen && all[0]) {
          setChosen(all[0]);
          setSelected(all[0].components.map((c) => c.id));
        }
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
      setChosen(last);
      setSelected(last.components.map((c) => c.id));
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
      const success = onEmbed(chosen, selected);
      if (success === false) return;
      onClose();
    } catch {
      setError("Не удалось сохранить библиотеку на устройстве.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialog}
        className="minimal-dialog library-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Библиотеки компонентов")}
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
          {discovered.length
            ? t(
                "В выбранной папке найдены библиотеки. Выберите компоненты для этого сценария.",
              )
            : t(
                "Загрузите библиотеку с компьютера или выберите сохранённую на этом устройстве.",
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
            {libraries.map((library) => (
              <button
                className={chosen?.id === library.id ? "selected" : ""}
                key={library.id}
                onClick={() => {
                  setChosen(library);
                  setSelected(library.components.map((c) => c.id));
                }}
              >
                <LibraryBig size={16} />
                <span>
                  {library.name}
                  <small>{library.components.length}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="library-components">
            {chosen?.components.map((component) => (
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
                <Link2 size={14} />
                <span>
                  {component.name}
                  <small>{component.description}</small>
                </span>
              </label>
            ))}
            {!chosen && (
              <p className="sidebar-empty">{t("Пока нет библиотек")}</p>
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
            {t("Отмена")}
          </button>
          <button
            className="primary-button"
            disabled={busy || !chosen || !selected.length}
            onClick={embed}
          >
            {t("Внедрить в сценарий")}
          </button>
        </div>
      </section>
    </div>
  );
}
