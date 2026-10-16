import { useEffect, useRef, useState } from "react";
import { t } from "./i18n.js";
import { createMorseKeyer, MORSE_DASH } from "./morse.js";
import "./telegraph.css";

export default function Telegraph({ language, onText }) {
  const [pressed, setPressed] = useState(false);
  const [tape, setTape] = useState([]);
  const [code, setCode] = useState("");
  const [text, setText] = useState("");
  const active = useRef(null),
    audio = useRef(null),
    keyer = useRef(null);
  const insert = useRef(onText);
  insert.current = onText;
  useEffect(() => {
    const sound = new Audio("/audio/telegraph/morse-code.mp3");
    sound.preload = "auto";
    sound.loop = true;
    audio.current = sound;
    const input = createMorseKeyer({
      language,
      onText(value) {
        if (!insert.current?.(value)) return false;
        setText((previous) => (previous + value).slice(-80));
        return true;
      },
      onSignal(symbol) {
        setTape((previous) => [...previous.slice(-63), { symbol, gap: 6 }]);
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
      active.current = null;
      setPressed(false);
      input.cancel();
      sound.pause();
      sound.currentTime = 0;
    };
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      input.dispose();
      keyer.current = null;
      active.current = null;
      sound.pause();
      sound.removeAttribute("src");
      sound.load();
      audio.current = null;
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [language]);
  const begin = (id) => {
    if (active.current !== null || !keyer.current?.press()) return;
    active.current = id;
    setPressed(true);
    if (audio.current) {
      audio.current.currentTime = 0;
      audio.current.play().catch(() => {});
    }
  };
  const end = (id, cancel = false) => {
    if (active.current !== id) return;
    active.current = null;
    setPressed(false);
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    if (cancel) keyer.current?.cancel();
    else keyer.current?.release();
  };
  const widths = tape.map((signal) => (signal.symbol === "-" ? 18 : 6));
  const total = tape.reduce(
    (sum, signal, index) => sum + widths[index] + signal.gap,
    0,
  );
  let x = Math.min(12, 256 - total - (pressed ? 18 : 0));
  const bars = tape.map((signal, index) => {
    const bar = (
      <rect key={index} x={x} y="11" width={widths[index]} height="22" />
    );
    x += widths[index] + signal.gap;
    return bar;
  });
  return (
    <section className="focus-telegraph" aria-label={t("Телеграф")}>
      <button
        type="button"
        className="telegraph-key"
        aria-label={t("Ключ телеграфа")}
        aria-pressed={pressed}
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
          height="162"
          alt=""
          draggable="false"
        />
        <img
          className="telegraph-pressed"
          src="/telegraph/pressed.png"
          width="280"
          height="162"
          alt=""
          draggable="false"
        />
      </button>
      <span id="telegraph-instructions" className="visually-hidden">
        {t(
          "Короткое нажатие — точка, длинное — тире. Пауза разделяет буквы и слова. Можно использовать Space или Enter.",
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
        {bars}
        {pressed && (
          <rect
            className="telegraph-live-signal"
            x={x}
            y="11"
            width="6"
            height="22"
            style={{ "--telegraph-dash-time": `${MORSE_DASH}ms` }}
          />
        )}
      </svg>
      <output
        className="telegraph-output"
        aria-live="polite"
        aria-label={t("Введено телеграфом")}
      >
        {text.slice(-36)}
      </output>
    </section>
  );
}
