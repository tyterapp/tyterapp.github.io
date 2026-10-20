import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { t } from "./i18n.js";
import { createMorseKeyer, MORSE_DASH } from "./morse.js";
import { createTelegraphAudio } from "./telegraph-audio.js";
import { Share2 } from "lucide-react";
import TelegramShare from "./TelegramShare.jsx";
import { TELEGRAM_MAX_TEXT } from "./telegram.js";
import "./telegraph.css";

export default function Telegraph({ language, onText, telegram = "" }) {
  const [sharedText, setSharedText] = useState(null);
  const [pressed, setPressed] = useState(false);
  const [heldDash, setHeldDash] = useState(false);
  const [tape, setTape] = useState([]);
  const [offset, setOffset] = useState(0);
  const [code, setCode] = useState("");
  const [text, setText] = useState("");
  const element = useRef(null);
  const active = useRef(null),
    audio = useRef(null),
    keyer = useRef(null),
    dashTimer = useRef(null);
  const insert = useRef(onText);
  insert.current = onText;
  useLayoutEffect(() => {
    const node = element.current;
    const column = node.closest(".editor-column");
    const bars = [
      ...column.querySelectorAll(".focus-format-hint, .screenplay-format-bar"),
    ];
    const fit = () => {
      const bar = bars.find((candidate) => candidate.getClientRects().length);
      const bottom = bar
        ? column.getBoundingClientRect().bottom -
          bar.getBoundingClientRect().top +
          22
        : 22;
      node.style.bottom = `${bottom}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(column);
    bars.forEach((bar) => observer.observe(bar));
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, []);
  useEffect(() => {
    const sound = createTelegraphAudio();
    audio.current = sound;
    const input = createMorseKeyer({
      language,
      onText(value) {
        if (!insert.current?.(value)) return false;
        setText((previous) => (previous + value).slice(-80));
        return true;
      },
      onSignal(symbol) {
        setTape((previous) => {
          const last = previous.at(-1);
          const x = last
            ? last.x + (last.symbol === "-" ? 18 : 6) + last.gap
            : 12;
          return [...previous.slice(-63), { symbol, gap: 6, x }];
        });
      },
      onBoundary(kind) {
        setTape((previous) =>
          previous.map((signal, index) =>
            index === previous.length - 1
              ? { ...signal, gap: kind === "word" ? 42 : 18 }
              : signal,
          ),
        );
      },
      onCode: setCode,
    });
    keyer.current = input;
    const cancel = () => {
      clearTimeout(dashTimer.current);
      active.current = null;
      setPressed(false);
      input.cancel();
      sound.stop();
    };
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(dashTimer.current);
      input.dispose();
      keyer.current = null;
      active.current = null;
      sound.dispose();
      audio.current = null;
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [language]);
  const begin = useCallback((id) => {
    if (active.current !== null || !keyer.current?.press()) return;
    active.current = id;
    setHeldDash(false);
    setPressed(true);
    dashTimer.current = setTimeout(() => setHeldDash(true), MORSE_DASH);
    audio.current?.start();
  }, []);
  const end = useCallback((id, cancel = false) => {
    if (active.current !== id) return;
    clearTimeout(dashTimer.current);
    active.current = null;
    setPressed(false);
    audio.current?.stop();
    if (cancel) keyer.current?.cancel();
    else keyer.current?.release();
  }, []);
  useEffect(() => {
    const isM = (event) =>
      event.code === "KeyM" || event.key.toLowerCase() === "m";
    const down = (event) => {
      if (
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.isComposing ||
        !isM(event) ||
        document.querySelector(
          'dialog[open], [role="dialog"][aria-modal="true"]',
        ) ||
        (event.target instanceof Element &&
          event.target.closest("input, textarea, select, [contenteditable]") &&
          !event.target.closest(".screenplay-editor"))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) begin("shortcut");
    };
    const up = (event) => {
      if (
        active.current !== "shortcut" ||
        !(isM(event) || (event.key === "Control" && !event.ctrlKey))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      end("shortcut");
    };
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    return () => {
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
    };
  }, [begin, end]);
  const last = tape.at(-1);
  const endX = last ? last.x + (last.symbol === "-" ? 18 : 6) : 12;
  const nextX = last ? endX + last.gap : 12;
  const right = pressed ? nextX + 18 : endX;
  useLayoutEffect(() => {
    // Keep committed marks anchored. Pauses and key release never rewind the tape.
    setOffset((previous) => Math.min(previous, 268 - right));
  }, [right]);
  const signals = pressed
    ? [...tape, { x: nextX, symbol: heldDash ? "-" : ".", live: true }]
    : tape;
  return (
    <section
      ref={element}
      className="focus-telegraph"
      aria-label={t("Телеграф")}
    >
      <button
        type="button"
        className="telegraph-key"
        aria-label={t("Ключ телеграфа")}
        aria-pressed={pressed}
        aria-keyshortcuts="Control+M Space Enter"
        aria-describedby="telegraph-instructions"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          begin(event.pointerId);
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* Detached pointer. */
          }
        }}
        onPointerUp={(event) => end(event.pointerId)}
        onPointerCancel={(event) => end(event.pointerId, true)}
        onLostPointerCapture={(event) => end(event.pointerId, true)}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (![" ", "Enter"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) begin(event.key);
        }}
        onKeyUp={(event) => {
          if (![" ", "Enter"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          end(event.key);
        }}
        onBlur={() => {
          if (typeof active.current === "string") end(active.current, true);
        }}
        onClick={(event) => {
          if (event.detail === 0) {
            begin("assistive");
            end("assistive");
          }
        }}
      >
        <img
          src="/telegraph/normal.png"
          width="280"
          height="164"
          alt=""
          draggable="false"
        />
        <img
          className="telegraph-pressed"
          src="/telegraph/pressed.png"
          width="280"
          height="164"
          alt=""
          draggable="false"
        />
      </button>
      <span id="telegraph-instructions" className="visually-hidden">
        {t(
          "Короткое нажатие — точка, длинное — тире. Пауза разделяет буквы и слова. Можно использовать Ctrl+M или Space/Enter на кнопке телеграфа.",
        )}
      </span>
      <svg
        className="telegraph-tape"
        width="280"
        height="44"
        viewBox="0 0 280 44"
        role="img"
        aria-label={`${t("Сигналы Морзе")}${code ? `: ${code}` : ""}`}
      >
        <path className="telegraph-baseline" d="M0 22h280" />
        <g
          className="telegraph-signals"
          style={{ transform: `translateX(${offset}px)` }}
        >
          {signals.map((signal) => (
            <rect
              key={signal.x}
              className={`telegraph-signal${signal.live ? " telegraph-live-signal" : ""}`}
              x={signal.x}
              y="11"
              width={signal.symbol === "-" ? 18 : 6}
              height="22"
            />
          ))}
        </g>
      </svg>
      <output
        className="telegraph-output visually-hidden"
        aria-live="polite"
        aria-label={t("Введено телеграфом")}
      >
        {text.slice(-36)}
      </output>
      <button
        type="button"
        className="telegraph-share-button"
        disabled={!telegram || telegram.length > TELEGRAM_MAX_TEXT}
        onClick={() => setSharedText(telegram)}
      >
        <Share2 size={16} aria-hidden="true" />
        {t("Поделиться телеграммой")}
      </button>
      {telegram.length > TELEGRAM_MAX_TEXT && (
        <span className="telegraph-share-limit" role="status">
          {t("Для ссылки оставьте не более 20 000 символов телеграммы.")}
        </span>
      )}
      {sharedText !== null && (
        <TelegramShare
          text={sharedText}
          language={language}
          onClose={() => setSharedText(null)}
        />
      )}
    </section>
  );
}
