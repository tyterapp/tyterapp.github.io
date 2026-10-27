import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLanguage } from "./i18n.js";
import { createDildaRenderer } from "./dilda-renderer.js";
import "./dildamode.css";

const textOf = (node) => node.text || (node.content || []).map(textOf).join("");
const splatPath =
  "M48 11C53-5 59 8 61 22C73 15 87 6 80 26C101 28 96 39 78 43C101 51 87 63 74 58C84 80 68 85 61 69C56 97 44 87 43 70C23 94 19 74 30 61C4 66 7 51 24 45C-5 31 12 22 33 31C28 7 43 2 48 24Z";
export default function DildaMode({ content, onClose }) {
  const language = useLanguage(),
    ru = language !== "en";
  const ref = useRef(null),
    canvas = useRef(null),
    render = useRef(null),
    close = useRef(null),
    paper = useRef(null),
    reticle = useRef(null),
    audio = useRef(null);
  const [item, setItem] = useState("dilda"),
    [hitCount, setHitCount] = useState(0),
    [hits, setHits] = useState([]),
    [fallback, setFallback] = useState(false);
  const timers = useRef(new Set()),
    audioPool = useRef([]),
    previousFocus = useRef(document.activeElement);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    close.current?.focus();
    try {
      render.current = createDildaRenderer(canvas.current, () =>
        setFallback(true),
      );
    } catch {
      setFallback(true);
    }
    return () => {
      render.current?.dispose();
      timers.current.forEach(clearTimeout);
      audioPool.current.forEach((a) => {
        a.pause();
        a.removeAttribute("src");
        a.load();
      });
      dialog.close();
      previousFocus.current?.focus?.({ preventScroll: true });
    };
  }, []);
  const choose = (value) => {
    setItem(value);
    render.current?.setItem(value);
  };
  const play = () => {
    // A bounded pool permits overlapping rapid shots without queuing delayed speech.
    const pool = audioPool.current;
    let sound = pool.find((a) => a.paused || a.ended);
    if (!sound && pool.length < 6) {
      sound = pool.length === 0 ? audio.current : audio.current.cloneNode();
      pool.push(sound);
    }
    sound ||= pool[0];
    sound.currentTime = 0;
    sound.volume = 0.7;
    sound.play().catch(() => {});
  };
  const move = (e) => {
    const bounds = ref.current.getBoundingClientRect(),
      x = e.clientX - bounds.left,
      y = e.clientY - bounds.top;
    reticle.current.style.transform = `translate(${x}px,${y}px)`;
    render.current?.aim(x / bounds.width, y / bounds.height);
  };
  const shoot = (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    move(e);
    play();
    const viewport = ref.current.getBoundingClientRect(),
      rect = paper.current.getBoundingClientRect();
    render.current?.shoot(
      (e.clientX - viewport.left) / viewport.width,
      (e.clientY - viewport.top) / viewport.height,
    );
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )
      return;
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    const timeout = setTimeout(() => {
      timers.current.delete(timeout);
      setHitCount((count) => count + 1);
      setHits((old) =>
        [...old, { x, y, item, id: crypto.randomUUID() }].slice(-300),
      );
    }, 320);
    timers.current.add(timeout);
  };
  return createPortal(
    <dialog
      ref={ref}
      className="dm-game"
      aria-label="Dilda Mode"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerMove={move}
      onPointerDown={shoot}
      onKeyDown={(e) => {
        // Native browser undo can still target the last editable region behind a modal.
        if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="dm-scene">
        <article
          ref={paper}
          className="dm-paper"
          aria-label={ru ? "Сценарий" : "Screenplay"}
        >
          {(content?.content || []).map((block, i) => (
            <p
              key={block.attrs?.blockId || i}
              data-format={block.attrs?.format || "action"}
            >
              {textOf(block) || "\u00a0"}
            </p>
          ))}
          <div className="dm-impacts" aria-hidden="true">
            {hits.map((hit) =>
              hit.item === "tomato" ? (
                <svg
                  key={hit.id}
                  className="dm-splat"
                  viewBox="-5 -5 110 110"
                  style={{
                    left: hit.x,
                    top: hit.y,
                    rotate: `${(hit.y % 70) - 35}deg`,
                  }}
                >
                  <path d={splatPath} />
                  <circle cx="3" cy="74" r="3" />
                  <circle cx="95" cy="13" r="4" />
                  <circle cx="100" cy="82" r="2" />
                </svg>
              ) : (
                <span
                  key={hit.id}
                  className="dm-impact"
                  style={{ left: hit.x, top: hit.y }}
                />
              ),
            )}
          </div>
        </article>
      </div>
      <canvas
        ref={canvas}
        className="dm-model"
        data-renderer={fallback ? "fallback" : "webgl"}
        aria-label={ru ? "3D модель перед камерой" : "First person 3D model"}
      />
      {fallback && (
        <div className="dm-fallback" aria-hidden="true">
          {item === "tomato" ? (
            "🍅"
          ) : (
            <img src="/dildamode/model-icon.png" alt="" />
          )}
        </div>
      )}
      <span ref={reticle} className="dm-crosshair" aria-hidden="true">
        <i />
        <b />
      </span>
      <div className="dm-score">
        <span>{ru ? "Попадания" : "Hits"}</span>
        <output className="dm-hit-count" aria-live="polite">
          {hitCount}
        </output>
      </div>
      <div
        className="dm-items"
        role="group"
        aria-label={ru ? "Предмет" : "Item"}
      >
        <button
          type="button"
          aria-label="Dilda"
          aria-pressed={item === "dilda"}
          onClick={() => choose("dilda")}
        >
          <img src="/dildamode/model-icon.png" alt="" />
        </button>
        <button
          type="button"
          aria-label={ru ? "Помидор" : "Tomato"}
          aria-pressed={item === "tomato"}
          onClick={() => choose("tomato")}
        >
          <span aria-hidden="true">🍅</span>
        </button>
      </div>
      <button
        ref={close}
        type="button"
        className="dm-close"
        aria-label={ru ? "Закрыть Dilda Mode" : "Close Dilda Mode"}
        onClick={onClose}
      >
        <X size={18} />
        <span>{ru ? "Закрыть" : "Close"}</span>
      </button>
      <audio
        ref={audio}
        className="dm-shot-audio"
        src="/dildamode/uuuu.wav"
        preload="auto"
      />
    </dialog>,
    document.body,
  );
}
