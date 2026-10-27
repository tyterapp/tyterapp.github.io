import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getLanguage, useLanguage } from "./i18n.js";
import ScriptVersionIcon from "./ScriptVersionIcon.jsx";
import { sceneDrama } from "./scene-drama.js";
import "./story-drama.css";

const tr = (ru, en) => (getLanguage() === "en" ? en : ru);
const label = (scene) => `${scene.number} ${scene.letter}`;
export function StoryDramaIcon() {
  return <span className="story-drama-icon" aria-hidden="true" />;
}

export default function StoryDramaPanel({
  scenes,
  selectedId,
  onSelect,
  onDragSelect = onSelect,
  onChange,
  onClose,
}) {
  useLanguage();
  const plot = useRef(null),
    drag = useRef(null),
    suppress = useRef(false);
  const callbacks = useRef({ onChange, onSelect, onDragSelect, onClose });
  callbacks.current = { onChange, onSelect, onDragSelect, onClose };
  const [availableWidth, setAvailableWidth] = useState(600);
  const [focusedId, setFocusedId] = useState(selectedId);
  const [dragging, setDragging] = useState(null);
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (selectedId) setFocusedId(selectedId);
  }, [selectedId]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setAvailableWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);
  const finish = (cancel = false) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    suppress.current = active.moved;
    setDragging(null);
    setDraft(null);
    if (!cancel && active.value !== active.startValue)
      callbacks.current.onChange(active.id, { drama: active.value });
    if (!cancel && active.moved) callbacks.current.onDragSelect(active.id);
    if (active.node.hasPointerCapture(active.pointerId))
      active.node.releasePointerCapture(active.pointerId);
  };
  useEffect(() => {
    const cancel = (event) => {
      if (event.key !== "Escape") return;
      if (
        !drag.current &&
        document.querySelector(
          'dialog[open], [role="dialog"][aria-modal="true"]',
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (drag.current) finish(true);
      else callbacks.current.onClose();
    };
    const blur = () => finish(true);
    window.addEventListener("keydown", cancel, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", cancel, true);
      window.removeEventListener("blur", blur);
      const active = drag.current;
      drag.current = null;
      if (active?.node.hasPointerCapture(active.pointerId))
        active.node.releasePointerCapture(active.pointerId);
    };
  }, []);
  const width = Math.max(availableWidth, scenes.length * 72 + 64),
    height = 240;
  const top = 38,
    bottom = 194,
    left = 36,
    step = (width - 60) / Math.max(1, scenes.length);
  const y = (value) => bottom - ((sceneDrama(value) - 1) * (bottom - top)) / 9;
  const valueOf = (scene) =>
    draft?.id === scene.id ? draft.value : sceneDrama(scene.settings.drama);
  const points = scenes.map((scene, index) => ({
    scene,
    x: left + (index + 0.5) * step,
    y: y(valueOf(scene)),
  }));
  const acts = [];
  points.forEach((point, index) => {
    const act = point.scene.settings.act || 1,
      previous = acts.at(-1);
    if (previous?.act === act) previous.end = left + (index + 1) * step;
    else
      acts.push({
        act,
        start: left + index * step,
        end: left + (index + 1) * step,
      });
  });
  const focused = scenes.find((scene) => scene.id === focusedId) || scenes[0];
  const start = (event, scene) => {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    setFocusedId(scene.id);
    setDragging(scene.id);
    suppress.current = false;
    const node = event.currentTarget;
    drag.current = {
      id: scene.id,
      pointerId: event.pointerId,
      node,
      startY: event.clientY,
      startValue: sceneDrama(scene.settings.drama),
      value: sceneDrama(scene.settings.drama),
      moved: false,
      pixelsPerUnit:
        (((bottom - top) / 9) *
          node.ownerSVGElement.getBoundingClientRect().height) /
        height,
    };
    node.setPointerCapture(event.pointerId);
  };
  const move = (event) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const delta = active.startY - event.clientY;
    if (Math.abs(delta) >= 3) active.moved = true;
    if (!active.moved) return;
    const value = sceneDrama(
      active.startValue + delta / Math.max(1, active.pixelsPerUnit),
    );
    if (value !== active.value) {
      active.value = value;
      setDraft({ id: active.id, value });
    }
  };
  return (
    <section
      className="story-drama-panel"
      aria-label={tr("График драматичности", "Drama chart")}
    >
      <header>
        <h2>
          <StoryDramaIcon />
          {tr("График драматичности", "Drama chart")}
        </h2>
        <button
          className="icon-button"
          type="button"
          aria-label={tr("Закрыть график", "Close chart")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <p className="story-drama-caption">
        {tr(
          "Все сцены по порядку сценария. Потяните фигуру вверх или вниз, чтобы изменить драматичность.",
          "All scenes in screenplay order. Drag a shape up or down to change its drama.",
        )}
      </p>
      {!scenes.length && (
        <p className="story-drama-empty">
          {tr(
            "Добавьте сцену, чтобы настроить драматичность истории.",
            "Add a scene to adjust the story’s drama.",
          )}
        </p>
      )}
      <div className="story-drama-plot" ref={plot}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          preserveAspectRatio="none"
          role="group"
          aria-label={tr(
            "Драматичность сцен от 1 до 10",
            "Scene drama from 1 to 10",
          )}
        >
          {acts.map(({ act, start, end }, index) => (
            <g key={index}>
              <rect
                className="story-drama-act-band"
                x={start}
                y={top - 14}
                width={end - start}
                height={bottom - top + 28}
                data-alternate={index % 2 === 1}
              />
              <text x={(start + end) / 2} y="14" textAnchor="middle">
                {tr("Акт", "Act")} {act}
              </text>
            </g>
          ))}
          {[1, 3, 5, 7, 10].map((value) => (
            <g key={value}>
              <line
                className="story-drama-grid"
                x1={left}
                x2={width - 12}
                y1={y(value)}
                y2={y(value)}
              />
              <text x="16" y={y(value) + 4} textAnchor="middle">
                {value}
              </text>
            </g>
          ))}
          <polyline
            className="story-drama-line"
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          />
          {points.map(({ scene, x, y }) => (
            <g
              key={scene.id}
              data-scene={scene.id}
              className={`story-drama-point${focused?.id === scene.id ? " is-selected" : ""}${dragging === scene.id ? " is-dragging" : ""}`}
              role="slider"
              tabIndex="0"
              aria-label={`${label(scene)} · ${scene.title || tr("Без названия", "Untitled")}`}
              aria-valuemin="1"
              aria-valuemax="10"
              aria-valuenow={valueOf(scene)}
              aria-orientation="vertical"
              onFocus={() => setFocusedId(scene.id)}
              onPointerDown={(event) => start(event, scene)}
              onPointerMove={move}
              onPointerUp={() => finish()}
              onPointerCancel={() => finish(true)}
              onLostPointerCapture={() => finish(true)}
              onClick={() => {
                if (!suppress.current) onSelect(scene.id);
                suppress.current = false;
              }}
              onKeyDown={(event) => {
                let value;
                if (["ArrowUp", "ArrowRight"].includes(event.key))
                  value = sceneDrama(scene.settings.drama) + 1;
                if (["ArrowDown", "ArrowLeft"].includes(event.key))
                  value = sceneDrama(scene.settings.drama) - 1;
                if (event.key === "Home") value = 1;
                if (event.key === "End") value = 10;
                if (value !== undefined) {
                  event.preventDefault();
                  onChange(scene.id, { drama: sceneDrama(value) });
                }
                if (["Enter", " "].includes(event.key)) {
                  event.preventDefault();
                  onSelect(scene.id);
                }
              }}
            >
              <rect
                className="story-drama-hit"
                x={x - 22}
                y={y - 22}
                width="44"
                height="44"
                rx="10"
              />
              <g
                className="story-drama-marker"
                transform={`translate(${x - 10} ${y - 10})`}
                pointerEvents="none"
              >
                <ScriptVersionIcon versionId={scene.color} size={20} />
              </g>
              <text
                className="story-drama-value"
                x={x}
                y={y - 25}
                textAnchor="middle"
                pointerEvents="none"
              >
                {valueOf(scene)}
              </text>
              <text x={x} y="231" textAnchor="middle" pointerEvents="none">
                {label(scene)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {focused && (
        <footer className="story-drama-selection">
          <span>
            <ScriptVersionIcon versionId={focused.color} />
            <strong>
              {label(focused)} ·{" "}
              {focused.title || tr("Без названия", "Untitled")}
            </strong>
          </span>
          <div
            className="story-drama-levels"
            role="radiogroup"
            aria-label={tr(
              "Драматичность выбранной сцены",
              "Selected scene drama",
            )}
            onKeyDown={(event) => {
              const direction = ["ArrowRight", "ArrowUp"].includes(event.key)
                ? 1
                : ["ArrowLeft", "ArrowDown"].includes(event.key)
                  ? -1
                  : 0;
              if (!direction && !["Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const value =
                event.key === "Home"
                  ? 1
                  : event.key === "End"
                    ? 10
                    : Math.max(1, Math.min(10, valueOf(focused) + direction));
              onChange(focused.id, { drama: value });
              event.currentTarget
                .querySelector(`[data-value="${value}"]`)
                ?.focus();
            }}
          >
            {Array.from({ length: 10 }, (_, index) => index + 1).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  data-value={value}
                  aria-checked={valueOf(focused) === value}
                  tabIndex={valueOf(focused) === value ? 0 : -1}
                  onClick={() => onChange(focused.id, { drama: value })}
                >
                  {value}
                </button>
              ),
            )}
          </div>
        </footer>
      )}
    </section>
  );
}
