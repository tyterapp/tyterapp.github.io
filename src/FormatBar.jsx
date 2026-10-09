import { t, useLanguage, languageLocale } from "./i18n.js";
export const FORMATS = [
  ["scene", "ИНТ/ЭКС", "Заголовок сцены"],
  ["action", "Действие", "Действие"],
  ["character", "Персонаж", "Персонаж"],
  ["speech", "Реплика", "Реплика"],
  ["parenthetical", "Ремарка", "Ремарка"],
  ["transition", "Переход", "Переход"],
  ["plain", "Заметки", "Обычный текст"],
];
export default function FormatBar({ format, displayMode = "text", onFormat }) {
  const language = useLanguage();
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "CTRL";
  const iconMode = displayMode === "icons";
  return (
    <footer className="minimal-footer">
      <div
        className={`screenplay-format-bar${iconMode ? " is-icon-mode" : ""}`}
        role="group"
        aria-label={t("Форматирование сценария")}
      >
        {FORMATS.map(([key, label, hint], i) => (
          <button
            className="format-bar-button"
            key={key}
            aria-label={t(label)}
            aria-description={t(hint)}
            aria-pressed={format === key}
            aria-describedby={`format-shortcut-${key}`}
            aria-keyshortcuts={`Control+${i + 1} Meta+${i + 1}`}
            data-tooltip={
              iconMode ? `${t(label)} · ${shortcut} + ${i + 1}` : undefined
            }
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(event) => {
              if (event.pointerType !== "mouse") event.preventDefault();
            }}
            onClick={() => onFormat(key)}
          >
            {iconMode ? (
              <img
                className="format-bar-icon"
                src={`/icons/format/${key}.svg`}
                alt=""
                aria-hidden="true"
              />
            ) : (
              t(label)
            )}
            <span
              className="format-shortcut"
              role="tooltip"
              id={`format-shortcut-${key}`}
            >
              {shortcut} + {i + 1}
            </span>
          </button>
        ))}
      </div>
    </footer>
  );
}
