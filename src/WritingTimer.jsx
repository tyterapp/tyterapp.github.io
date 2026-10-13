import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Play, X, Flame, Store } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { formatTimerTime, TIMER_MINUTES } from "./writing-timer.js";
import WritingShop from "./WritingShop.jsx";
import {
  MoneyIcon,
  PauseIcon,
  StopIcon,
  TimerIcon,
} from "./WritingTimerIcons.jsx";

export default function WritingTimer({ visible, timer, onStreak }) {
  const language = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopClosing, setShopClosing] = useState(false);
  const shopButtonRef = useRef(null);
  const shopCloseTimeout = useRef(null);
  const [stacked, setStacked] = useState(false);
  const ref = useRef(null);
  const paused = timer.session?.status === "paused";
  const time = formatTimerTime(timer.remainingMs);
  const closeShop = () => {
    if (!shopOpen || shopClosing) return;
    setShopClosing(true);
    shopCloseTimeout.current = setTimeout(() => {
      setShopOpen(false);
      setShopClosing(false);
      shopButtonRef.current?.focus({ preventScroll: true });
    }, 160);
  };
  useEffect(() => () => clearTimeout(shopCloseTimeout.current), []);
  useEffect(() => {
    if (!visible || timer.session || pickerOpen) {
      clearTimeout(shopCloseTimeout.current);
      setShopOpen(false);
      setShopClosing(false);
    }
  }, [visible, timer.session?.id, pickerOpen]);
  useEffect(() => {
    if (!shopOpen) return;
    const close = (event) => {
      if (event.type === "keydown" && event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        closeShop();
      } else if (
        event.type === "pointerdown" &&
        !ref.current?.contains(event.target)
      )
        closeShop();
    };
    document.addEventListener("keydown", close, true);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close, true);
      document.removeEventListener("pointerdown", close);
    };
  }, [shopOpen, shopClosing]);

  useEffect(() => {
    if (!visible || timer.session) setPickerOpen(false);
  }, [visible, timer.session?.id]);
  useEffect(() => {
    if (!pickerOpen) return;
    const close = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setPickerOpen(false);
      } else if (
        event.type === "pointerdown" &&
        !ref.current?.contains(event.target)
      )
        setPickerOpen(false);
    };
    document.addEventListener("keydown", close, true);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close, true);
      document.removeEventListener("pointerdown", close);
    };
  }, [pickerOpen]);
  useLayoutEffect(() => {
    if (!visible || !ref.current) return;
    const column = ref.current.parentElement;
    const bar = column.querySelector(".screenplay-format-bar");
    const fit = () => {
      if (!ref.current) return;
      const space = (column.clientWidth - (bar?.offsetWidth || 400)) / 2 - 24;
      ref.current.style.setProperty(
        "--timer-toolbar-height",
        `${bar?.offsetHeight || 48}px`,
      );
      setStacked(space < ref.current.offsetWidth);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(column);
    observer.observe(ref.current);
    if (bar) observer.observe(bar);
    fit();
    return () => observer.disconnect();
  }, [visible, pickerOpen, !!timer.session]);

  if (!visible) return null;
  return (
    <div
      ref={ref}
      className={`writing-timer${stacked ? " is-stacked" : ""}`}
      role="group"
      aria-label={t("Таймер письма")}
      onMouseDown={(event) => event.preventDefault()}
    >
      {shopOpen && (
        <WritingShop timer={timer} closing={shopClosing} onClose={closeShop} />
      )}
      {timer.streak && !timer.session && !pickerOpen && (
        <button
          type="button"
          className="writing-timer-button is-idle writing-streak"
          data-tooltip={t("Дней подряд: {0}", timer.streak.count)}
          aria-label={t("Показать стрик")}
          onClick={() => onStreak?.(timer.streak)}
        >
          <Flame size={20} aria-hidden="true" />
          {timer.streak.count}
        </button>
      )}
      {timer.session ? (
        <>
          <button
            type="button"
            className="writing-timer-button"
            aria-label={t("Завершить таймер")}
            data-tooltip={t("Завершить без награды")}
            onClick={timer.stop}
          >
            <StopIcon />
          </button>
          <span
            className={`writing-timer-time${paused ? " is-paused" : ""}`}
            role="timer"
            aria-live="off"
            aria-label={t("Осталось {0}", time)}
          >
            {time}
          </span>
          <button
            type="button"
            className="writing-timer-button"
            aria-label={t(
              paused ? "Продолжить таймер" : "Приостановить таймер",
            )}
            data-tooltip={t(
              paused ? "Продолжить таймер" : "Приостановить таймер",
            )}
            aria-pressed={paused}
            onClick={timer.toggle}
          >
            {paused ? <Play size={20} /> : <PauseIcon />}
          </button>
        </>
      ) : pickerOpen ? (
        <div
          className="writing-timer-presets"
          role="group"
          aria-label={t("Время таймера")}
        >
          {TIMER_MINUTES.map((minutes) => (
            <button
              type="button"
              className="writing-timer-button"
              key={minutes}
              aria-label={t("{0} мин", minutes)}
              data-tooltip={t("За полный отсчёт: {0} монет", minutes)}
              onClick={() => timer.start(minutes)}
            >
              {minutes}
            </button>
          ))}
          <button
            type="button"
            className="writing-timer-button"
            aria-label={t("Закрыть выбор времени")}
            onClick={() => setPickerOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="writing-timer-button is-idle"
            aria-label={t("Открыть таймер")}
            data-tooltip={t("Таймер письма")}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen(true)}
          >
            <TimerIcon />
          </button>
          <span
            className="writing-timer-balance"
            aria-label={t("Монеты: {0}", timer.coins)}
            data-tooltip={t("Монеты: {0}", timer.coins)}
          >
            <MoneyIcon />
            <span>{timer.coins}</span>
          </span>
          <button
            ref={shopButtonRef}
            type="button"
            className="writing-timer-button is-idle"
            aria-label={language === "en" ? "Open shop" : "Открыть магазин"}
            data-tooltip={language === "en" ? "Shop" : "Магазин"}
            aria-expanded={shopOpen && !shopClosing}
            aria-controls="writing-shop"
            onClick={() => {
              if (shopOpen && !shopClosing) closeShop();
              else {
                clearTimeout(shopCloseTimeout.current);
                setShopClosing(false);
                setShopOpen(true);
              }
            }}
          >
            <Store size={20} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
