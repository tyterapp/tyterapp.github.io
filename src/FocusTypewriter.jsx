import { useEffect, useRef, useState } from "react";
import { t, useLanguage } from "./i18n.js";
import { FORMATS } from "./FormatBar.jsx";
import {
  clampTypewriterPosition,
  moveTypewriterCaret,
  typewriterCaret,
} from "./typewriter-caret.js";
import "./focus-typewriter.css";

const asset = (state, file) => `/typewriter/${state}/${file}`;
function Layers({ file, className, ...props }) {
  return (
    <span className={className} {...props} aria-hidden="true">
      <img
        className="typewriter-off"
        src={asset("off", file)}
        alt=""
        draggable="false"
      />
      <img
        className="typewriter-on"
        src={asset("on", file)}
        alt=""
        draggable="false"
      />
    </span>
  );
}

export default function FocusTypewriter({ containerRef, lampOn, scope }) {
  const language = useLanguage();
  const [caret, setCaret] = useState({
    format: "action",
    word: "",
    linked: false,
  });
  const [geometry, setGeometry] = useState(null);
  const [misspelled, setMisspelled] = useState(false);
  const rig = useRef(null),
    drag = useRef(null),
    controller = useRef(null);

  useEffect(() => {
    const dom = containerRef.current?.querySelector(".screenplay-editor");
    const editor = dom?.editor,
      paper = dom?.closest(".script-paper");
    const scroller = dom?.closest(".minimal-scroll");
    if (!editor || !paper) return;
    let frame,
      stopped = false;
    const measure = () => {
      if (stopped || editor.isDestroyed || !dom.getClientRects().length) return;
      const next = typewriterCaret(editor.state);
      setCaret((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
      if (drag.current) return;
      const bounds = paper.getBoundingClientRect();
      const coords = editor.view.coordsAtPos(editor.state.selection.head);
      const left = bounds.left - 12,
        width = bounds.width + 24;
      const point = clampTypewriterPosition(
        { x: coords.left - left, y: (coords.top + coords.bottom) / 2 + 32 },
        { width, top: 40, bottom: window.innerHeight - 70 },
      );
      setGeometry({ left, width, ...point });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    controller.current = { editor, refresh: schedule };
    editor.on("transaction", schedule);
    editor.on("focus", schedule);
    scroller?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(paper);
    schedule();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      editor.off("transaction", schedule);
      editor.off("focus", schedule);
      scroller?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      drag.current = null;
      controller.current = null;
    };
  }, [containerRef, scope]);

  useEffect(() => {
    const worker = new Worker(
      new URL("./dictionary.worker.js", import.meta.url),
      { type: "module" },
    );
    let request = 0,
      timer,
      lastWord;
    const check = () => {
      const { editor } = controller.current || {};
      if (!editor) return;
      const { word, language } = typewriterCaret(editor.state);
      const key = `${language}:${word}`;
      if (key === lastWord) return;
      lastWord = key;
      const current = ++request;
      setMisspelled(false);
      clearTimeout(timer);
      if (word.length < 2) return;
      timer = setTimeout(
        () =>
          worker.postMessage({ type: "check", id: current, word, language }),
        200,
      );
    };
    worker.onmessage = ({ data }) => {
      if (data.type === "spelling" && data.id === request)
        setMisspelled(!data.unavailable && data.correct === false);
    };
    worker.onerror = () => setMisspelled(false);
    const editor = controller.current?.editor;
    // Restores can replace text with emitUpdate:false at the same numeric
    // selection. Transactions still fire; word keys avoid duplicate checks.
    editor?.on("transaction", check);
    check();
    return () => {
      clearTimeout(timer);
      worker.terminate();
      editor?.off("transaction", check);
    };
  }, [scope, containerRef]);

  const move = (x, y, focus = true) => {
    const editor = controller.current?.editor;
    if (!editor || !geometry) return;
    const point = clampTypewriterPosition(
      { x, y },
      { width: geometry.width, top: 40, bottom: window.innerHeight - 70 },
    );
    setGeometry({ ...geometry, ...point });
    moveTypewriterCaret(editor, geometry.left + point.x, point.y - 32, focus);
  };
  const finish = (event) => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    controller.current?.refresh();
  };
  if (!geometry) return null;
  const format =
    caret.format === "scene"
      ? asset("off", "Line_format.svg")
      : `/icons/format/${caret.format}.svg`;
  return (
    <div
      ref={rig}
      className="typewriter-rig"
      data-lamp={lampOn ? "on" : "off"}
      style={{
        left: geometry.left,
        top: geometry.y - 16,
        width: geometry.width,
      }}
    >
      <Layers
        className="typewriter-cap typewriter-left"
        file="Left_element.svg"
      />
      <svg
        className="typewriter-tube"
        viewBox="10.1 5.1 50 10"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <image
          href={asset("off", "Tube.svg")}
          x="0"
          y="0"
          width="71"
          height="31"
        />
      </svg>
      <Layers
        className="typewriter-cap typewriter-right"
        file="Right_element.svg"
      />
      <button
        type="button"
        className="typewriter-carriage"
        style={{ left: geometry.x - 32 }}
        aria-label={
          language === "ru"
            ? "Переместить машинку и текстовый курсор"
            : "Move typewriter and text caret"
        }
        aria-description={[
          t(FORMATS.find(([key]) => key === caret.format)?.[1] || "Действие"),
          caret.linked
            ? language === "ru"
              ? "Компонент или ссылка"
              : "Component or link"
            : "",
          misspelled
            ? language === "ru"
              ? "Возможная ошибка в слове"
              : "Possible spelling error"
            : "",
        ]
          .filter(Boolean)
          .join(". ")}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            x: geometry.x,
            y: geometry.y,
          };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.id !== event.pointerId) return;
          move(
            start.x + event.clientX - start.clientX,
            start.y + event.clientY - start.clientY,
          );
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onKeyDown={(event) => {
          const steps = {
            ArrowLeft: [-8, 0],
            ArrowRight: [8, 0],
            ArrowUp: [0, -24],
            ArrowDown: [0, 24],
          };
          if (steps[event.key]) {
            event.preventDefault();
            const [dx, dy] = steps[event.key];
            move(geometry.x + dx, geometry.y + dy, false);
          } else if (["Enter", "Escape"].includes(event.key)) {
            event.preventDefault();
            controller.current?.editor.view.dom.focus({ preventScroll: true });
          }
        }}
      >
        <img
          className="typewriter-beam"
          src={asset("on", "Light_on.png")}
          alt=""
          draggable="false"
        />
        <span className="typewriter-body" aria-hidden="true">
          <img src={asset("off", "bg.svg")} alt="" draggable="false" />
        </span>
        <Layers
          className="typewriter-light-indicator"
          file="Light_indicator.svg"
        />
        <Layers className="typewriter-cursor" file="Cursor_down.svg" />
        <span
          className="typewriter-bulb typewriter-blue"
          data-on={caret.linked}
          aria-hidden="true"
        >
          <img src={asset("off", "Lamps_off.svg")} alt="" draggable="false" />
          <img
            className="typewriter-bulb-glow"
            src={asset("off", "Lamp_blue_on.svg")}
            alt=""
            draggable="false"
          />
        </span>
        <span
          className="typewriter-bulb typewriter-red"
          data-on={misspelled}
          aria-hidden="true"
        >
          <img src={asset("off", "Lamps_off.svg")} alt="" draggable="false" />
          <img
            className="typewriter-bulb-glow"
            src={asset("off", "Lamp_red_on.svg")}
            alt=""
            draggable="false"
          />
        </span>
        <img
          className="typewriter-format"
          data-format={caret.format}
          src={format}
          alt=""
          draggable="false"
        />
      </button>
    </div>
  );
}
