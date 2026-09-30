import { useEffect, useRef, useState } from "react";
import { commentText, quoteDiff } from "./comment-review.js";
import {
  Check,
  MessageSquare,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";

export function SearchBar({ query, onQuery, index, count, onMove, onClose }) {
  const input = useRef(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <div className="script-search" role="search" aria-label="Поиск по сценарию">
      <Search size={16} />
      <input
        ref={input}
        aria-label="Поиск по тексту"
        placeholder="Найти в сценарии…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onMove(e.shiftKey ? -1 : 1);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <span className="search-count" aria-live="polite">
        {count ? `${index + 1} / ${count}` : query ? "Нет совпадений" : "0 / 0"}
      </span>
      <button
        disabled={!count}
        className="icon-button"
        aria-label="Предыдущее совпадение"
        onClick={() => onMove(-1)}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        disabled={!count}
        className="icon-button"
        aria-label="Следующее совпадение"
        onClick={() => onMove(1)}
      >
        <ChevronRight size={16} />
      </button>
      <button
        className="icon-button"
        aria-label="Закрыть поиск"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function CommentsPanel({
  comments,
  content,
  quote,
  activeId,
  onClose,
  onClearQuote,
  onAdd,
  onToggle,
  onFocus,
  onFilterChange,
}) {
  const [text, setText] = useState(""),
    [filter, setFilter] = useState("open");
  const input = useRef(null),
    active = useRef(null);
  useEffect(() => {
    if (quote) {
      setFilter("open");
      input.current?.focus();
    }
  }, [quote]);
  useEffect(() => {
    if (activeId) {
      setFilter(
        comments.find((c) => c.id === activeId)?.resolved ? "resolved" : "open",
      );
      requestAnimationFrame(() =>
        active.current?.scrollIntoView({ block: "nearest" }),
      );
    }
  }, [activeId]);
  const visible = comments.filter((c) =>
    filter === "resolved" ? c.resolved : !c.resolved,
  );
  return (
    <aside className="comments-drawer" aria-label="Комментарии сценария">
      <div className="drawer-heading">
        <h2>
          Комментарии <span>{comments.filter((c) => !c.resolved).length}</span>
        </h2>
        <button
          className="icon-button"
          aria-label="Закрыть комментарии"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="comment-filters">
        <button
          aria-pressed={filter === "open"}
          onClick={() => {
            setFilter("open");
            onFilterChange?.();
          }}
        >
          Открытые
        </button>
        <button
          aria-pressed={filter === "resolved"}
          onClick={() => {
            setFilter("resolved");
            onFilterChange?.();
          }}
        >
          Решённые
        </button>
      </div>
      <div className="comment-list">
        {visible.map((c) => (
          <article
            key={c.id}
            ref={c.id === activeId ? active : null}
            className={`comment-card${c.id === activeId ? " active" : ""}${c.resolved ? " resolved" : ""}`}
            onClick={(e) => {
              if (!e.target.closest("button")) onFocus(c);
            }}
          >
            <div className="comment-meta">
              <span>{c.author || "Вы"}</span>
              <time>
                {new Date(c.createdAt).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "short",
                })}
              </time>
            </div>
            {c.quote && (
              <button
                className="comment-quote"
                onClick={() => onFocus(c)}
                data-tooltip="Перейти к тексту"
              >
                {c.resolved && c.id === activeId
                  ? quoteDiff(c.quote, commentText(content, c.id)).map(
                      (part, i) => (
                        <span
                          key={i}
                          className={
                            part.deleted
                              ? "comment-deleted-text"
                              : "comment-surviving-text"
                          }
                        >
                          {part.text}
                        </span>
                      ),
                    )
                  : c.quote}
              </button>
            )}
            <p>{c.text}</p>
            <button className="comment-resolve" onClick={() => onToggle(c)}>
              <Check size={13} />
              {c.resolved ? "Открыть снова" : "Решено"}
            </button>
          </article>
        ))}
        {!visible.length && (
          <div className="comments-empty">
            <MessageSquare size={23} />
            <p>
              {filter === "open"
                ? "Здесь будут ваши заметки к сценарию."
                : "Решённых комментариев пока нет."}
            </p>
            <small>Выделите текст и нажмите на иконку комментария.</small>
          </div>
        )}
      </div>
      <form
        className="comment-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            onAdd(text.trim());
            setText("");
          }
        }}
      >
        {quote?.text && (
          <div className="composer-quote">
            <span>{quote.text}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Убрать цитату"
              onClick={onClearQuote}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <label className="visually-hidden" htmlFor="comment-text">
          Текст комментария
        </label>
        <textarea
          ref={input}
          id="comment-text"
          rows={3}
          maxLength={10000}
          placeholder={
            quote ? "Комментарий к выделению…" : "Заметка к сценарию…"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && text.trim()) {
              e.preventDefault();
              onAdd(text.trim());
              setText("");
            }
          }}
        />
        <div>
          <small>Ctrl+Enter — отправить</small>
          <button className="primary-button" disabled={!text.trim()}>
            Добавить
          </button>
        </div>
      </form>
    </aside>
  );
}

const STEPS = [
  [
    "Место для вашей истории",
    "Пишите сценарий на чистом листе. В меню слева сверху находятся все ваши документы: создавайте, переименовывайте и переключайтесь между ними.",
    "Документы → Новый сценарий",
  ],
  [
    "Сценарный формат — с клавиатуры",
    "Кнопки на нижней панели и Ctrl+1…7 меняют тип абзаца под курсором. В настройках документа переключайте панель между текстом и иконками. Наведите на иконку, чтобы увидеть название действия и сочетание клавиш. Активный тип выделен белым. Enter после персонажа создаёт реплику.",
    "1 Сцена · 2 Действие · 3 Персонаж · 4 Реплика · 5 Ремарка · 6 Переход · 7 Текст",
  ],
  [
    "Подсказки под рукой",
    "В начале сцены выбирайте ИНТ., ЭКС. или смешанный заголовок. После места и тире — ДЕНЬ, НОЧЬ, ВЕЧЕР или УТРО. В тексте предлагаются только ваши компоненты с иконкой.",
    "Ctrl+Enter — принять · ↑ ↓ — выбрать",
  ],
  [
    "Компоненты вашей истории",
    "Выделите имя или место и нажмите Ctrl+D либо иконку компонента. Новый компонент можно сохранить в своей папке; существующий откроется для редактирования. Бесплатно доступны 10 компонентов на сценарий. В Pro реквизит создаётся через Ctrl+E: задайте количество, и все совпадения названия подсветятся в тексте.",
    "Ctrl+D — создать из выделения · Ctrl+Enter — вставить подсказку",
  ],
  [
    "Выделите важное",
    "Выделите фрагмент, чтобы сделать его жирным, курсивным или подчёркнутым, создать компонент или оставить комментарий.",
    "Ctrl+B — жирный · Ctrl+I — курсив · Ctrl+U — подчёркивание",
  ],
  [
    "Находите и обсуждайте",
    "Ctrl+F открывает справа все результаты поиска. Нажмите карточку, чтобы перейти к совпадению. Comments на нижней панели открывает заметки. Решённая заметка больше не подсвечивается жёлтым; при её выборе видны сохранившийся и удалённый текст.",
    "Ctrl+F — поиск · Ctrl+8 — комментарии",
  ],
  [
    "Настройте документ",
    "В настройках выбирайте шрифт для работы, добавляйте постер, автора, год и email. Экспорт всегда использует Courier. Размер шрифта меняется от 12 до 26 pt ползунком или Ctrl + колесо мыши на листе. В статистике одна страница равна одной минуте хронометража.",
    "Настройки — иконка ползунков вверху",
  ],
  [
    "Ваши файлы остаются у вас",
    "Сценарии сохраняются автоматически. В веб-версии Pro иконка папки подключает вашу папку для сохранения TYT в Chrome и Edge. В других браузерах скачивайте TYT вручную. Вращающаяся стрелка означает сохранение. Бесплатно доступны два документа.",
    "Локальные файлы включают компоненты и комментарии.",
  ],
  [
    "Соберите историю в аутлайне",
    "В Pro переключатель «Сценарий / Аутлайн» открывает карточки истории. Добавляйте акты, карточки, цвета и комментарии; ищите нужную карточку. Новая карточка создаёт сцену, затем текст карточки и сценария редактируется независимо. Прицел ведёт к сцене, синий значок рядом с номером сцены — обратно к карточке.",
    "TYT сохраняет аутлайн, сценарий, компоненты, реквизит и комментарии.",
  ],
];
export function Onboarding({ onClose }) {
  const [step, setStep] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="minimal-dialog onboarding"
      aria-label="Знакомство с редактором"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="tour-top">
        <span>
          TYTER{" "}
          <span>
            {" "}
            / {step + 1} из {STEPS.length}
          </span>
        </span>
        <button
          className="icon-button"
          aria-label="Закрыть обучение"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="tour-progress">
        {STEPS.map((_, i) => (
          <span key={i} className={i <= step ? "done" : ""} />
        ))}
      </div>
      <h2>{STEPS[step][0]}</h2>
      <p>{STEPS[step][1]}</p>
      <div className="tour-example">{STEPS[step][2]}</div>
      <div className="dialog-actions">
        <button className="quiet-button" onClick={onClose}>
          Пропустить
        </button>
        {step > 0 && (
          <button className="quiet-button" onClick={() => setStep(step - 1)}>
            Назад
          </button>
        )}
        <button
          className="primary-button"
          onClick={() =>
            step === STEPS.length - 1 ? onClose() : setStep(step + 1)
          }
        >
          {step === STEPS.length - 1 ? "Начать писать" : "Далее"}
        </button>
      </div>
    </dialog>
  );
}
