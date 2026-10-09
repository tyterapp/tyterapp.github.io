import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Layers3,
  Sparkles,
  LockKeyhole,
  Check,
  Clock3,
  Pause,
  Play,
  Star,
} from "lucide-react";
import { t, useLanguage, languageLocale } from "../../i18n.js";
import { getWordCount } from "../../data.js";
import { TIMER_MINUTES, formatTimerTime } from "../../writing-timer.js";
import { MoneyIcon } from "../../WritingTimerIcons.jsx";
import {
  dailyQuestLibrary,
  continuationIdea,
  IDEA_PRICE,
  WORDS_PER_CARD,
} from "./library.js";
import { unlockedCards, questStatus, questWords } from "./progress.js";
import QuestArt from "./QuestArt.jsx";

const errorText = (reason) =>
  ({
    coins: "Недостаточно монет. Завершите полный таймер, чтобы заработать ещё.",
    storage:
      "Не удалось сохранить задание. Освободите место на устройстве и попробуйте снова.",
    busy: "Таймер связан с другой версией. Завершите или остановите его перед новым заданием.",
    active: "Сначала завершите или отмените текущее задание.",
    expired: "Время истекло. Начните задание заново.",
    words: "Допишите нужное количество слов перед завершением.",
    locked: "Пишите во время таймера, чтобы открыть эту карту.",
    completed: "Это задание уже выполнено сегодня.",
  })[reason] || "Не удалось начать задание. Попробуйте снова.";
export function questCards(scope, record, timer) {
  return [
    ...dailyQuestLibrary(scope, record.day),
    ...timer.ideas
      .filter((idea) => idea.scope === scope && idea.day === record.day)
      .map((idea) => ({
        id: idea.id,
        theme: "hope",
        hue: 285,
        title: "Продолжение истории",
        type: "Ваша история",
        prompt: idea.text,
        hint: "Идея на основе текста выбранной версии сценария.",
        rarity: "Особенная",
        goal: 100,
        generated: true,
      })),
  ];
}

export default function DailyQuests({
  scope,
  quests,
  timer,
  onCards,
  onClose,
  onComplete,
}) {
  useLanguage();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const { record } = quests;
  const cards = questCards(scope, record, timer);
  const active = cards.find((card) => card.id === record.active?.cardId);
  const status = questStatus(record, timer.session);
  const words = questWords(record);
  const count =
    unlockedCards(record, cards.filter((card) => !card.generated).length) +
    cards.filter((card) => card.generated).length;
  const finish = async () => {
    setBusy(true);
    try {
      const result = await quests.finish(active);
      if (result.ok) {
        setFeedback(
          "Задание выполнено! Продолжайте писать, чтобы открыть новые карты.",
        );
        onComplete?.(
          "Задание выполнено! Продолжайте писать, чтобы открыть новые карты.",
        );
      } else setFeedback(errorText(result.reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="daily-quests-drawer" aria-label={t("Задания")}>
      <div className="drawer-heading">
        <h2>
          <Layers3 size={18} />
          {t("Задания")}
        </h2>
        <button
          className="icon-button"
          aria-label={t("Закрыть задания")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="quest-today">
        <span>{t("Только сегодня")}</span>
        <strong>
          {new Date(`${record.day}T12:00:00`).toLocaleDateString(
            languageLocale(),
            { day: "numeric", month: "long" },
          )}
        </strong>
      </div>
      <button className="quest-day-preview" onClick={onCards}>
        <QuestArt theme={cards[0].theme} />
        <span>
          <small>{t("Карта дня")}</small>
          <strong>{t(cards[0].title)}</strong>
          <ChevronRight size={18} />
        </span>
      </button>
      <button className="quiet-button quest-library-button" onClick={onCards}>
        <Layers3 size={16} />
        {t("Карточки сегодня")}
        <span>
          {count}/{cards.length}
        </span>
      </button>
      <div className="quest-writing-progress">
        <span>{t("Написано сегодня")}</span>
        <strong>{t("{0} слов", record.words)}</strong>
        <progress value={record.words % WORDS_PER_CARD} max={WORDS_PER_CARD} />
        <small>
          {t(
            "Каждые {0} новых слов открывают следующую карту.",
            WORDS_PER_CARD,
          )}
        </small>
      </div>
      <section className="quest-active" aria-label={t("Текущее задание")}>
        {active ? (
          <>
            <span className="quest-section-label">{t("Текущее задание")}</span>
            <h3>{t(active.title)}</h3>
            <p>{active.generated ? active.prompt : t(active.prompt)}</p>
            <div className="quest-run">
              <span>
                <Clock3 size={16} />
                {status === "expired"
                  ? t("Время истекло")
                  : formatTimerTime(timer.remainingMs)}
              </span>
              {status !== "expired" && (
                <button
                  className="icon-button"
                  aria-label={t(
                    status === "paused"
                      ? "Продолжить таймер"
                      : "Приостановить таймер",
                  )}
                  onClick={timer.toggle}
                >
                  {status === "paused" ? (
                    <Play size={16} />
                  ) : (
                    <Pause size={16} />
                  )}
                </button>
              )}
            </div>
            <div className="quest-word-goal">
              <span>{t("Новых слов: {0} / {1}", words, active.goal)}</span>
              <progress
                value={Math.min(words, active.goal)}
                max={active.goal}
              />
            </div>
            <button
              className="primary-button quest-finish"
              disabled={busy || status !== "running" || words < active.goal}
              onClick={finish}
            >
              <Check size={17} />
              {t("Завершить задание")}
            </button>
            <small>
              {t(
                "Нажмите «Завершить» до окончания таймера. Монеты начисляются за полный отсчёт.",
              )}
            </small>
            <button
              className="quiet-button"
              disabled={busy}
              onClick={async () => {
                await quests.cancel();
                setFeedback("");
              }}
            >
              {t(
                status === "expired"
                  ? "Выбрать задание снова"
                  : "Отменить задание",
              )}
            </button>
          </>
        ) : (
          <>
            <Sparkles size={22} />
            <h3>{t("История начинается с карты")}</h3>
            <p>
              {t(
                "Выберите задание, установите таймер и напишите 100 новых слов. Завершите задание здесь до сигнала.",
              )}
            </p>
            <button className="primary-button" onClick={onCards}>
              {t("Выбрать карту")}
            </button>
          </>
        )}
      </section>
      {record.completed.length > 0 && (
        <p className="quest-completed-count">
          <Check size={16} />
          {t("Выполнено сегодня: {0}", record.completed.length)}
        </p>
      )}
      {!!feedback && (
        <p className="quest-feedback" role="status">
          {t(feedback)}
        </p>
      )}
    </aside>
  );
}

export function QuestOverlay({
  scope,
  document: screenplay,
  quests,
  timer,
  onClose,
  onAccepted,
}) {
  const language = useLanguage();
  const ref = useRef(null),
    carousel = useRef(null),
    pointer = useRef(null),
    lastWheel = useRef(0);
  const [index, setIndex] = useState(0),
    [minutes, setMinutes] = useState(25),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  const { record } = quests;
  const cards = useMemo(
    () => questCards(scope, record, timer),
    [scope, record.day, timer.ideas],
  );
  const available = unlockedCards(
    record,
    cards.filter((card) => !card.generated).length,
  );
  const card = cards[Math.min(index, cards.length - 1)];
  const open = index < available || card.generated;
  const completed = record.completed.includes(card.id);
  const readyForIdea = getWordCount(screenplay.content) >= 20;
  const move = (amount) =>
    setIndex((current) => (current + amount + cards.length) % cards.length);
  useEffect(() => {
    setIndex((current) => Math.min(current, cards.length - 1));
  }, [cards.length]);
  useLayoutEffect(() => {
    const previous = window.document.activeElement;
    ref.current.showModal();
    ref.current.querySelector(".quest-overlay-close")?.focus();
    return () => {
      ref.current?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const surface = carousel.current;
    const wheel = (event) => {
      if (
        event.target.closest(".quest-card-copy")?.scrollHeight >
        event.target.closest(".quest-card-copy")?.clientHeight
      )
        return;
      event.preventDefault();
      if (
        Math.abs(event.deltaY) + Math.abs(event.deltaX) < 15 ||
        Date.now() - lastWheel.current < 260
      )
        return;
      lastWheel.current = Date.now();
      move(event.deltaY + event.deltaX > 0 ? 1 : -1);
    };
    surface.addEventListener("wheel", wheel, { passive: false });
    return () => surface.removeEventListener("wheel", wheel);
  }, [cards.length]);
  const accept = async () => {
    setBusy(true);
    setFeedback("");
    try {
      const result = await quests.begin(card.id, minutes);
      if (result.ok) {
        onAccepted();
        onClose();
      } else setFeedback(errorText(result.reason));
    } finally {
      setBusy(false);
    }
  };
  const buy = async () => {
    setBusy(true);
    setFeedback("");
    const idea = {
      id: globalThis.crypto.randomUUID(),
      scope,
      day: record.day,
      text: continuationIdea(
        screenplay,
        record.day,
        cards.filter((card) => card.generated).length,
        language,
      ),
    };
    try {
      const result = await timer.buyIdea(idea);
      if (result.ok) {
        setIndex(cards.length);
        setFeedback("Продолжение добавлено в ваши карточки на сегодня.");
      } else setFeedback(errorText(result.reason));
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <dialog
      ref={ref}
      className="daily-quest-overlay"
      aria-label={t("Карточки заданий на сегодня")}
      data-quest-overlay="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          move(event.key === "ArrowRight" ? 1 : -1);
        }
        event.stopPropagation();
      }}
    >
      <div className="quest-overlay-shell">
        <header className="quest-overlay-heading">
          <div>
            <span className="quest-pro-label">
              TYTER PRO · {t("Карта дня")}
            </span>
            <h2>{t("Новая история ждёт")}</h2>
            <p>
              {t(
                "Только сегодня · {0}",
                new Date(`${record.day}T12:00:00`).toLocaleDateString(
                  languageLocale(),
                  { day: "numeric", month: "long" },
                ),
              )}
            </p>
          </div>
          <div className="quest-overlay-top-actions">
            <span
              className="quest-wallet"
              aria-label={t("Монеты: {0}", timer.coins)}
            >
              <MoneyIcon />
              {timer.coins}
            </span>
            <button
              className="icon-button quest-overlay-close"
              aria-label={t("Закрыть карточки")}
              onClick={onClose}
            >
              <X size={22} />
            </button>
          </div>
        </header>
        <div
          className="quest-carousel"
          ref={carousel}
          role="region"
          aria-roledescription={t("Карусель")}
          aria-label={t("Коллекция заданий")}
          onPointerDown={(event) => {
            pointer.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (
              pointer.current !== null &&
              Math.abs(event.clientX - pointer.current) > 45
            )
              move(event.clientX < pointer.current ? 1 : -1);
            pointer.current = null;
          }}
        >
          {cards.map((item, at) => {
            let offset = at - index;
            if (offset > cards.length / 2) offset -= cards.length;
            if (offset < -cards.length / 2) offset += cards.length;
            const visible = Math.abs(offset) <= 2,
              unlocked = at < available || !!item.generated;
            return (
              <article
                key={item.id}
                className={`quest-card${offset === 0 ? " is-current" : ""}${unlocked ? "" : " is-locked"}${visible ? "" : " is-offstage"}`}
                style={{
                  "--quest-hue": item.hue,
                  "--card-offset": offset,
                  "--card-distance": Math.abs(offset),
                }}
                aria-hidden={!visible || offset !== 0}
                data-card-id={item.id}
                data-unlocked={unlocked}
              >
                {unlocked ? (
                  <div className="quest-card-face">
                    <div className="quest-card-title">
                      <strong>{t(item.title)}</strong>
                      <span>
                        {t(item.type)} <Star size={12} />
                      </span>
                    </div>
                    <div className="quest-card-art">
                      <QuestArt theme={item.theme} />
                    </div>
                    <div className="quest-card-rarity">
                      <span>{t(item.rarity)}</span>
                      <span>#{String(at + 1).padStart(2, "0")}</span>
                    </div>
                    <div
                      className="quest-card-copy"
                      tabIndex={offset === 0 ? 0 : -1}
                    >
                      <h3>
                        {item.generated
                          ? t("Поворот вашей истории")
                          : t("Сегодняшнее задание")}
                      </h3>
                      <p>{item.generated ? item.prompt : t(item.prompt)}</p>
                      <small>{t(item.hint)}</small>
                    </div>
                    <footer>
                      <span>
                        <Layers3 size={14} />
                        {t("{0} новых слов", item.goal)}
                      </span>
                      <span>
                        {record.completed.includes(item.id) ? (
                          <>
                            <Check size={14} />
                            {t("Выполнено")}
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} />
                            {t("Сегодня")}
                          </>
                        )}
                      </span>
                    </footer>
                  </div>
                ) : (
                  <div className="quest-card-back">
                    <div className="quest-card-seal">
                      <Layers3 size={46} />
                    </div>
                    <LockKeyhole size={22} />
                    <h3>{t("Закрытая карта")}</h3>
                    <p>
                      {t(
                        "Ещё {0} слов до открытия",
                        Math.max(0, at * WORDS_PER_CARD - record.words),
                      )}
                    </p>
                    <small>TYTER · {t("Истории внутри")}</small>
                  </div>
                )}
                {visible && offset !== 0 && (
                  <button
                    tabIndex={-1}
                    className="quest-side-hit"
                    aria-hidden="true"
                    onClick={() => setIndex(at)}
                  />
                )}
              </article>
            );
          })}
        </div>
        <div className="quest-carousel-nav">
          <button
            className="icon-button"
            aria-label={t("Предыдущая карта")}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={22} />
          </button>
          <span aria-live="polite">
            {t("Карточка {0} из {1}", index + 1, cards.length)}
          </span>
          <button
            className="icon-button"
            aria-label={t("Следующая карта")}
            onClick={() => move(1)}
          >
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="quest-overlay-controls">
          {open && !completed ? (
            <>
              {timer.session ? (
                <span className="quest-existing-timer">
                  <Clock3 size={16} />
                  {formatTimerTime(timer.remainingMs)}
                </span>
              ) : (
                <div
                  className="quest-duration"
                  role="group"
                  aria-label={t("Время задания")}
                >
                  {TIMER_MINUTES.map((value) => (
                    <button
                      key={value}
                      aria-pressed={value === minutes}
                      onClick={() => setMinutes(value)}
                    >
                      {t("{0} мин", value)}
                    </button>
                  ))}
                </div>
              )}
              <button
                className="primary-button quest-accept"
                disabled={
                  busy ||
                  (!!record.active &&
                    questStatus(record, timer.session) !== "expired")
                }
                onClick={accept}
              >
                <Clock3 size={17} />
                {t(
                  timer.session
                    ? "Принять с текущим таймером"
                    : "Принять задание",
                )}
              </button>
            </>
          ) : (
            <p className="quest-card-state">
              {completed ? (
                <>
                  <Check size={18} />
                  {t("Это задание уже выполнено сегодня.")}
                </>
              ) : (
                <>
                  <LockKeyhole size={18} />
                  {t("Пишите во время таймера, чтобы открыть эту карту.")}
                </>
              )}
            </p>
          )}
        </div>
        <div className="quest-story-generator">
          <div>
            <Sparkles size={18} />
            <span>
              <strong>{t("Продолжить вашу историю")}</strong>
              <small>
                {t(
                  readyForIdea
                    ? "Идея по персонажам и последней сцене, созданная на этом устройстве."
                    : "Сначала напишите хотя бы 20 слов в сценарии.",
                )}
              </small>
            </span>
          </div>
          <button
            className="quiet-button"
            disabled={busy || !readyForIdea || timer.coins < IDEA_PRICE}
            onClick={buy}
          >
            {t("Создать идею")}
            <MoneyIcon />
            {IDEA_PRICE}
          </button>
        </div>
        {!!feedback && (
          <p className="quest-overlay-feedback" role="status">
            {t(feedback)}
          </p>
        )}
      </div>
    </dialog>,
    window.document.body,
  );
}
