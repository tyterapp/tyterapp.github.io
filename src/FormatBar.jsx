export const FORMATS = [
  ["scene", "ИНТ/ЭКС", "Заголовок сцены"],
  ["action", "Действие", "Действие"],
  ["character", "Персонаж", "Персонаж"],
  ["speech", "Реплика", "Реплика"],
  ["parenthetical", "Ремарка", "Ремарка"],
  ["transition", "Переход", "Переход"],
  ["plain", "Заметки", "Обычный текст"],
];
export default function FormatBar({
  format,
  displayMode = "text",
  onFormat,
  commentsOpen,
  commentCount,
  onComments,
}) {
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "CTRL";
  const iconMode = displayMode === "icons";
  return (
    <footer className="minimal-footer">
      <div
        className={`screenplay-format-bar${iconMode ? " is-icon-mode" : ""}`}
        role="group"
        aria-label="Форматирование сценария"
      >
        {FORMATS.map(([key, label, hint], i) => (
          <button
            className="format-bar-button"
            key={key}
            aria-label={label}
            aria-description={hint}
            aria-pressed={format === key}
            aria-describedby={`format-shortcut-${key}`}
            aria-keyshortcuts={`Control+${i + 1} Meta+${i + 1}`}
            data-tooltip={
              iconMode ? `${label} · ${shortcut} + ${i + 1}` : undefined
            }
            onMouseDown={(e) => e.preventDefault()}
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
              label
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
        <span className="format-bar-divider" aria-hidden="true" />
        <button
          className="format-bar-button format-comments"
          aria-label="Комментарии"
          aria-expanded={commentsOpen}
          aria-describedby="format-shortcut-comments"
          aria-keyshortcuts="Control+8 Meta+8"
          data-tooltip={iconMode ? `Комментарии · ${shortcut} + 8` : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onComments}
        >
          {iconMode ? (
            <img
              className="format-bar-icon"
              src="/icons/format/comments.svg"
              alt=""
              aria-hidden="true"
            />
          ) : (
            "Комментарии"
          )}{" "}
          <span className="comment-count">{commentCount}</span>
          <span
            className="format-shortcut"
            role="tooltip"
            id="format-shortcut-comments"
          >
            {shortcut} + 8
          </span>
        </button>
      </div>
    </footer>
  );
}
