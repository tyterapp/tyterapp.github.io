import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useRef, useState } from "react";
import { SHORTCUT_GROUPS } from "./keyboard-shortcuts.js";
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
  const language = useLanguage();
  const input = useRef(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <div
      className="script-search"
      role="search"
      aria-label={t("Поиск по сценарию")}
    >
      <Search size={16} />
      <input
        ref={input}
        aria-label={t("Поиск по тексту")}
        placeholder={t("Найти в сценарии…")}
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
        {count
          ? `${index + 1} / ${count}`
          : query
            ? t("Нет совпадений")
            : "0 / 0"}
      </span>
      <button
        disabled={!count}
        className="icon-button"
        aria-label={t("Предыдущее совпадение")}
        onClick={() => onMove(-1)}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        disabled={!count}
        className="icon-button"
        aria-label={t("Следующее совпадение")}
        onClick={() => onMove(1)}
      >
        <ChevronRight size={16} />
      </button>
      <button
        className="icon-button"
        aria-label={t("Закрыть поиск")}
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
  const language = useLanguage();
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
        active.current?.scrollIntoView({
          block: "nearest",
        }),
      );
    }
  }, [activeId]);
  const visible = comments.filter((c) =>
    filter === "resolved" ? c.resolved : !c.resolved,
  );
  return (
    <aside className="comments-drawer" aria-label={t("Комментарии сценария")}>
      <div className="drawer-heading">
        <h2>
          {t("Комментарии ")}
          <span>{comments.filter((c) => !c.resolved).length}</span>
        </h2>
        <button
          className="icon-button"
          aria-label={t("Закрыть комментарии")}
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
          {t("Открытые")}
        </button>
        <button
          aria-pressed={filter === "resolved"}
          onClick={() => {
            setFilter("resolved");
            onFilterChange?.();
          }}
        >
          {t("Решённые")}
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
              <span>{c.author || t("Вы")}</span>
              <time>
                {new Date(c.createdAt).toLocaleDateString(languageLocale(), {
                  day: "numeric",
                  month: "short",
                })}
              </time>
            </div>
            {c.quote && (
              <button
                className="comment-quote"
                onClick={() => onFocus(c)}
                data-tooltip={t("Перейти к тексту")}
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
              {c.resolved ? t("Открыть снова") : t("Решено")}
            </button>
          </article>
        ))}
        {!visible.length && (
          <div className="comments-empty">
            <MessageSquare size={23} />
            <p>
              {filter === "open"
                ? t("Здесь будут ваши заметки к сценарию.")
                : t("Решённых комментариев пока нет.")}
            </p>
            <small>
              {t("Выделите текст и нажмите на иконку комментария.")}
            </small>
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
              aria-label={t("Убрать цитату")}
              onClick={onClearQuote}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <label className="visually-hidden" htmlFor="comment-text">
          {t("Текст комментария")}
        </label>
        <textarea
          ref={input}
          id="comment-text"
          rows={3}
          maxLength={10000}
          placeholder={
            quote ? t("Комментарий к выделению…") : t("Заметка к сценарию…")
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
          <small>{t("Ctrl+Enter — отправить")}</small>
          <button className="primary-button" disabled={!text.trim()}>
            {t("Добавить")}
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
    "Выделите имя или место и нажмите Ctrl+D либо иконку компонента. Компонент сразу создаётся и открывается для редактирования в сайдбаре; существующий откроется без дубликата. Бесплатно доступны 10 компонентов на сценарий. В Pro Ctrl+E сразу создаёт реквизит и открывает его в сайдбаре: задайте количество, и все совпадения названия подсветятся в тексте.",
    "Ctrl+D — создать из выделения · Ctrl+Enter — вставить подсказку",
  ],
  [
    "Выделите важное",
    "Выделите фрагмент, чтобы сделать его жирным, курсивным или подчёркнутым, создать компонент или оставить комментарий.",
    "Ctrl+B — жирный · Ctrl+I — курсив · Ctrl+U — подчёркивание",
  ],
  [
    "Находите и обсуждайте",
    "Ctrl+F открывает слева результаты поиска. Нажмите карточку, чтобы перейти к совпадению. Иконка комментариев в левой панели открывает обсуждения. Решённый комментарий больше не открывается при клике на текст; его можно посмотреть во вкладке «Решённые».",
    "Ctrl+F — поиск · Ctrl+8 — комментарии",
  ],
  [
    "Настройте документ",
    "В настройках выбирайте шрифт для работы, добавляйте постер, автора, год и email. Экспорт всегда использует Courier. Масштаб документа меняется от 100% до 200% ползунком или Ctrl + колесо мыши на листе. Текст, лист и отступы увеличиваются вместе; масштаб не меняет экспорт и хронометраж. В статистике одна страница равна одной минуте хронометража.",
    "Настройки — иконка ползунков внизу левой панели",
  ],
  [
    "Ваши файлы остаются у вас",
    "Сценарии сохраняются автоматически. В веб-версии Pro иконка папки подключает вашу папку для сохранения TYT в Chrome и Edge. В других браузерах скачивайте TYT вручную. Вращающаяся стрелка означает сохранение. Бесплатно доступны два документа.",
    "Локальные файлы включают компоненты и комментарии.",
  ],
  [
    "Соберите историю в аутлайне",
    "В Pro переключатель справа сверху открывает «Сценарий / Аутлайн». Alt+1 ведёт к сценарию, Alt+2 — к карточкам. Добавляйте акты, карточки, цвета и комментарии; ищите нужную карточку. Новая карточка создаёт сцену, затем текст карточки и сценария редактируется независимо. Прицел ведёт к сцене, синий значок рядом с номером сцены — обратно к карточке.",
    "Alt+1 — сценарий · Alt+2 — аутлайн · TYT сохраняет оба режима.",
  ],
];
export function Onboarding({ onClose }) {
  const language = useLanguage();
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState("onboarding");
  const ref = useRef(null);
  const body = useRef(null);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  useEffect(() => {
    body.current?.scrollTo({
      top: 0,
    });
  }, [tab, step]);
  return (
    <dialog
      ref={ref}
      className={`minimal-dialog onboarding${tab === "shortcuts" ? " help-shortcuts" : ""}`}
      aria-label={t("Знакомство с редактором")}
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
            {tab === "onboarding"
              ? t("/ {0} из {1}", step + 1, STEPS.length)
              : t("/ Помощь")}
          </span>
        </span>
        <button
          className="icon-button"
          aria-label={t("Закрыть обучение")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="help-tabs" role="tablist" aria-label={t("Раздел помощи")}>
        {[
          ["onboarding", t("Онбординг")],
          ["shortcuts", t("Горячие клавиши")],
        ].map(([id, label]) => (
          <button
            key={id}
            id={`help-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`help-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "onboarding"
                  : event.key === "End"
                    ? "shortcuts"
                    : tab === "onboarding"
                      ? "shortcuts"
                      : "onboarding";
              setTab(next);
              document.getElementById(`help-tab-${next}`)?.focus();
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div
        ref={body}
        className="help-body"
        role="tabpanel"
        id={`help-panel-${tab}`}
        aria-labelledby={`help-tab-${tab}`}
      >
        {tab === "onboarding" ? (
          <>
            <div className="tour-progress">
              {STEPS.map((_, i) => (
                <span key={i} className={i <= step ? "done" : ""} />
              ))}
            </div>
            <h2>{t(STEPS[step][0])}</h2>
            <p>{t(STEPS[step][1])}</p>
            <div className="tour-example">{t(STEPS[step][2])}</div>
            <div className="dialog-actions">
              <button className="quiet-button" onClick={onClose}>
                {t("Пропустить")}
              </button>
              {step > 0 && (
                <button
                  className="quiet-button"
                  onClick={() => setStep(step - 1)}
                >
                  {t("Назад")}
                </button>
              )}
              <button
                className="primary-button"
                onClick={() =>
                  step === STEPS.length - 1 ? onClose() : setStep(step + 1)
                }
              >
                {step === STEPS.length - 1 ? t("Начать писать") : t("Далее")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>{t("Горячие клавиши")}</h2>
            <p className="shortcuts-intro">
              {t(
                "Сочетания для работы в редакторе. Действия с компонентами и реквизитом используют выделенный текст.",
              )}
            </p>
            {SHORTCUT_GROUPS.map((group) => (
              <section
                className="shortcuts-section"
                key={t(group.title)}
                aria-label={t(group.title)}
              >
                <h3>{t(group.title)}</h3>
                <dl>
                  {group.items.map(([keys, description, macKeys], index) => (
                    <div className="shortcut-row" key={index}>
                      <dt>
                        <kbd>
                          {t(
                            mac
                              ? macKeys || keys.replaceAll("Ctrl", "⌘")
                              : keys,
                          )}
                        </kbd>
                      </dt>
                      <dd>{t(description)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </>
        )}
      </div>
    </dialog>
  );
}
