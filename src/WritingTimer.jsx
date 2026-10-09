import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Play, X, Flame } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { formatTimerTime, TIMER_MINUTES } from "./writing-timer.js";
import {
  MoneyIcon,
  PauseIcon,
  StopIcon,
  TimerIcon,
} from "./WritingTimerIcons.jsx";

export default function WritingTimer({ visible, timer }) {
  useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stacked, setStacked] = useState(false);
  const ref = useRef(null);
  const paused = timer.session?.status === "paused";
  const time = formatTimerTime(timer.remainingMs);

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
      {timer.streak && !timer.session && !pickerOpen && (
        <span
          className="writing-streak"
          data-tooltip={t("Дней подряд: {0}", timer.streak.count)}
          aria-label={t("Дней подряд: {0}", timer.streak.count)}
        >
          <Flame size={13} />
          {timer.streak.count}
        </span>
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
        </>
      )}
    </div>
  );
}
