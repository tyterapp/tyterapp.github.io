import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { formatTimerTime, TIMER_MINUTES } from "./writing-timer.js";
import WritingHouse from "./WritingHouse.jsx";
import WritingCoins from "./WritingCoins.jsx";
import WritingTikiTok from "./WritingTikiTok.jsx";
import { CatIcon } from "./WritingHouseIcons.jsx";
import {
  MoneyIcon,
  PauseIcon,
  StopIcon,
  TimerIcon,
} from "./WritingTimerIcons.jsx";

export default function WritingTimer({
  visible,
  timer,
  onResetProgress,
  onBurnPage,
  burnDisabled = false,
  dictation,
}) {
  const language = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [panel, setPanel] = useState("");
  const houseOpen = panel === "house";
  const coinsOpen = panel === "coins";
  const tikiTokOpen = panel === "tikitok";
  const [panelClosing, setPanelClosing] = useState(false);
  const houseButtonRef = useRef(null);
  const coinsButtonRef = useRef(null);
  const panelCloseTimeout = useRef(null);
  const [stacked, setStacked] = useState(false);
  const [rewardPulse, setRewardPulse] = useState(0);
  const [visitPulse, setVisitPulse] = useState(null);
  const lastWritingReward = useRef(timer.writingReward ?? 0);
  const ref = useRef(null);
  const paused = timer.session?.status === "paused";
  const time = formatTimerTime(timer.remainingMs);
  useEffect(() => {
    const reward = timer.writingReward ?? 0;
    const previous = lastWritingReward.current;
    lastWritingReward.current = reward;
    if (!visible || reward < previous) {
      setRewardPulse(0);
      return;
    }
    if (reward === previous) return;
    setRewardPulse(reward);
    const timeout = setTimeout(() => setRewardPulse(0), 1000);
    return () => clearTimeout(timeout);
  }, [timer.writingReward, visible]);
  useEffect(() => {
    if (!timer.visitReward) return;
    setVisitPulse(timer.visitReward);
    const timeout = setTimeout(() => setVisitPulse(null), 1800);
    return () => clearTimeout(timeout);
  }, [timer.visitReward]);
  const closePanel = (restoreFocus = true) => {
    if (!panel || panelClosing) return;
    const button = houseOpen ? houseButtonRef : coinsButtonRef;
    setPanelClosing(true);
    panelCloseTimeout.current = setTimeout(() => {
      setPanel("");
      setPanelClosing(false);
      if (restoreFocus) button.current?.focus({ preventScroll: true });
    }, 160);
  };
  useEffect(() => () => clearTimeout(panelCloseTimeout.current), []);
  useEffect(() => {
    if (!visible || timer.session || pickerOpen) {
      clearTimeout(panelCloseTimeout.current);
      setPanel("");
      setPanelClosing(false);
    }
  }, [visible, timer.session?.id, pickerOpen]);
  useEffect(() => {
    if (!timer.hasHouse && houseOpen) {
      clearTimeout(panelCloseTimeout.current);
      setPanel("");
      setPanelClosing(false);
      coinsButtonRef.current?.focus({ preventScroll: true });
    }
  }, [timer.hasHouse, houseOpen]);
  useEffect(() => {
    if (!timer.hasTikiTok && tikiTokOpen) {
      clearTimeout(panelCloseTimeout.current);
      setPanel("");
      setPanelClosing(false);
      coinsButtonRef.current?.focus({ preventScroll: true });
    }
  }, [timer.hasTikiTok, tikiTokOpen]);
  useEffect(() => {
    if (!panel) return;
    const close = (event) => {
      if (event.type === "keydown" && event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        closePanel();
      } else if (
        event.type === "pointerdown" &&
        !tikiTokOpen &&
        !(
          houseOpen &&
          event.target.closest?.(".minimal-scroll, .screenplay-format-bar")
        ) &&
        !ref.current?.contains(event.target)
      )
        closePanel(false);
    };
    document.addEventListener("keydown", close, true);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close, true);
      document.removeEventListener("pointerdown", close);
    };
  }, [panel, panelClosing]);

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
      const top = Math.max(
        column.getBoundingClientRect().top,
        window.visualViewport?.offsetTop || 0,
      );
      // Leave 12px between the panel and toolbar, and 12px above the panel.
      const available = Math.max(
        0,
        ref.current.getBoundingClientRect().top - top - 24,
      );
      ref.current.style.setProperty(
        "--writing-popover-height",
        `${Math.floor(available)}px`,
      );
      const viewport = window.visualViewport;
      const right = viewport
        ? viewport.offsetLeft + viewport.width
        : window.innerWidth;
      ref.current.style.setProperty(
        "--writing-popover-width",
        `${Math.max(0, Math.floor(right - ref.current.getBoundingClientRect().left - 12))}px`,
      );
    };
    const observer = new ResizeObserver(fit);
    observer.observe(column);
    observer.observe(ref.current);
    if (bar) observer.observe(bar);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("scroll", fit);
    };
  }, [visible, pickerOpen, !!timer.session, stacked, panel]);

  if (!visible) return null;
  return (
    <div
      ref={ref}
      className={`writing-timer${stacked ? " is-stacked" : ""}`}
      role="group"
      aria-label={t("Таймер письма")}
      onMouseDown={(event) => event.preventDefault()}
    >
      {houseOpen && (
        <WritingHouse
          closing={panelClosing}
          onClose={closePanel}
          skinId={timer.houseSkin}
          writingActivity={timer.writingActivity}
        />
      )}
      {tikiTokOpen && (
        <WritingTikiTok closing={panelClosing} onClose={closePanel} />
      )}
      {coinsOpen && (
        <WritingCoins
          timer={timer}
          closing={panelClosing}
          onClose={closePanel}
          onResetProgress={onResetProgress}
          burnDisabled={burnDisabled}
          dictation={dictation}
          onOpenTikiTok={() => {
            if (!timer.hasTikiTok) return;
            clearTimeout(panelCloseTimeout.current);
            setPanelClosing(false);
            setPanel("tikitok");
          }}
          onBurnPage={() => {
            clearTimeout(panelCloseTimeout.current);
            setPanel("");
            setPanelClosing(false);
            onBurnPage?.();
          }}
        />
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
      )}
      {(!pickerOpen || rewardPulse > 0) && (
        <span className="writing-balance-wrap">
          {visitPulse && (
            <span
              key={visitPulse.id}
              className="writing-visit-reward"
              role="status"
            >
              +{visitPulse.amount}
            </span>
          )}
          <button
            ref={coinsButtonRef}
            type="button"
            className={`writing-timer-balance${rewardPulse > 0 ? " is-rewarding" : ""}${pickerOpen ? " is-transient" : ""}`}
            aria-label={t("Монеты: {0}", timer.coins)}
            data-tooltip={coinsOpen ? undefined : t("Монеты: {0}", timer.coins)}
            aria-expanded={coinsOpen && !panelClosing}
            aria-controls="writing-coins"
            disabled={pickerOpen}
            onClick={() => {
              if (coinsOpen && !panelClosing) closePanel();
              else {
                clearTimeout(panelCloseTimeout.current);
                setPanelClosing(false);
                setPanel("coins");
              }
            }}
          >
            {rewardPulse > 0 && (
              <span
                key={`sweep-${rewardPulse}`}
                className="writing-timer-balance-sweep"
                aria-hidden="true"
              />
            )}
            <span
              key={`balance-${rewardPulse}`}
              className="writing-timer-balance-content"
            >
              <MoneyIcon />
              <span>{timer.coins}</span>
            </span>
          </button>
        </span>
      )}
      {timer.hasHouse && !timer.session && !pickerOpen && (
        <button
          ref={houseButtonRef}
          type="button"
          className="writing-timer-button is-idle"
          aria-label={
            language === "en" ? "Open oiia house" : "Открыть oiia домик"
          }
          data-tooltip={language === "en" ? "oiia house" : "oiia домик"}
          aria-expanded={houseOpen && !panelClosing}
          aria-controls="writing-house"
          onClick={() => {
            if (houseOpen && !panelClosing) closePanel();
            else {
              clearTimeout(panelCloseTimeout.current);
              setPanelClosing(false);
              setPanel("house");
            }
          }}
        >
          <CatIcon />
        </button>
      )}
    </div>
  );
}
