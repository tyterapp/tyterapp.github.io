import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { dramaValue } from "./document-layout.js";
export default function OutlineDramaChart({
  columns,
  cards,
  selectedId,
  onSelect,
  onChangeDrama,
  onClose,
}) {
  const language = useLanguage();
  const plot = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const gradientId = useId().replaceAll(":", "");
  const [availableWidth, setAvailableWidth] = useState(660);
  const [height, setHeight] = useState(220);
  const [hovered, setHovered] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(Math.floor(entry.contentRect.width));
      setHeight(Math.floor(entry.contentRect.height));
    });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);
  const ordered = columns.flatMap((column) =>
    cards.filter((card) => card.columnId === column.id),
  );
  const units = columns.reduce(
    (count, column) =>
      count +
      Math.max(1, cards.filter((card) => card.columnId === column.id).length),
    0,
  );
  const compact = availableWidth < 360;
  const width = Math.max(availableWidth, units * 32 + (compact ? 20 : 72), 1);
  const top = 28,
    bottom = height - 42,
    left = compact ? 18 : 48,
    right = width - (compact ? 2 : 24);
  const step = (right - left) / Math.max(units, 1);
  const hitWidth = Math.max(32, Math.min(88, step));
  let offset = 0;
  const acts = columns.map((column) => {
    const actCards = ordered.filter((card) => card.columnId === column.id);
    const start = left + offset * step;
    const points = actCards.map((card, index) => ({
      card,
      x: start + (index + 0.5) * step,
      y: bottom - (dramaValue(card.drama) * (bottom - top)) / 10,
    }));
    offset += Math.max(1, actCards.length);
    return {
      column,
      start,
      end: left + offset * step,
      points,
    };
  });
  const points = acts.flatMap((act) => act.points);
  const focused = ordered.find((card) => card.id === (hovered || selectedId));
  const startDrag = (event, card) => {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    const svg = event.currentTarget.ownerSVGElement;
    const scale = svg.getBoundingClientRect().height / height;
    drag.current = {
      pointerId: event.pointerId,
      cardId: card.id,
      startY: event.clientY,
      startValue: dramaValue(card.drama),
      value: dramaValue(card.drama),
      pixelsPerUnit: Math.max(1, ((bottom - top) * scale) / 10),
      moved: false,
    };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(card.id);
    onSelect(card.id);
  };
  const moveDrag = (event) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const delta = active.startY - event.clientY;
    if (Math.abs(delta) >= 3) active.moved = true;
    if (!active.moved) return;
    const value = dramaValue(active.startValue + delta / active.pixelsPerUnit);
    if (value !== active.value) {
      active.value = value;
      onChangeDrama(active.cardId, value);
    }
  };
  const endDrag = (event) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
    setDraggingId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <aside
      className="outline-drama-panel"
      aria-label={t("График драматичности")}
    >
      <div className="outline-drama-heading">
        <h2>{t("Драматичность истории")}</h2>
        <button
          className="icon-button"
          aria-label={t("Закрыть график")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p className="outline-drama-caption">
        {t(
          "Все акты и карточки в порядке аутлайна. Нажмите на точку, чтобы открыть карточку, или перетащите её вверх и вниз, чтобы изменить драматичность.",
        )}
      </p>
      {!ordered.length && (
        <p className="outline-drama-empty">
          {t("Добавьте карточки и укажите их драматичность от 0 до 10.")}
        </p>
      )}
      <div className="outline-drama-scroll" ref={plot}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            width,
          }}
          role="group"
          aria-label={t("Драматичность по актам")}
        >
          <defs>
            {points.slice(1).map((point, index) => {
              const from = points[index];
              return (
                <linearGradient
                  key={point.card.id}
                  id={`${gradientId}-${index}`}
                  gradientUnits="userSpaceOnUse"
                  x1={from.x}
                  y1={from.y}
                  x2={point.x}
                  y2={point.y}
                >
                  <stop offset="0%" stopColor={from.card.color || "#33313b"} />
                  <stop
                    offset="100%"
                    stopColor={point.card.color || "#33313b"}
                  />
                </linearGradient>
              );
            })}
          </defs>
          {acts.map(({ column, start, end }, index) => (
            <g key={column.id}>
              <rect
                x={start}
                y={top}
                width={end - start}
                height={bottom - top}
                fill={index % 2 ? "#f4f2f8" : "#faf9fc"}
              />
              <foreignObject
                x={start + 6}
                y={bottom + 15}
                width={Math.max(1, end - start - 12)}
                height={26}
              >
                <div className="outline-drama-act" aria-label={column.title}>
                  {column.title}
                </div>
              </foreignObject>
            </g>
          ))}
          {[0, 2, 4, 6, 8, 10].map((value) => {
            const y = bottom - (value * (bottom - top)) / 10;
            return (
              <g key={value}>
                <line x1={left} x2={right} y1={y} y2={y} stroke="#e7e3ed" />
                <text
                  x={left - (compact ? 8 : 12)}
                  y={y + 4}
                  textAnchor={compact ? "middle" : "end"}
                >
                  {value}
                </text>
              </g>
            );
          })}
          {points.slice(1).map((point, index) => (
            <line
              className="drama-segment"
              key={point.card.id}
              x1={points[index].x}
              y1={points[index].y}
              x2={point.x}
              y2={point.y}
              stroke={`url(#${gradientId}-${index})`}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          ))}
          {points.map(({ card, x, y }) => (
            <g
              key={card.id}
              style={{
                "--drama-color": card.color || "#33313b",
              }}
              className={
                "outline-drama-point" +
                (card.id === selectedId ? " is-selected" : "") +
                (card.id === draggingId ? " is-dragging" : "")
              }
              role="button"
              tabIndex={0}
              aria-pressed={card.id === selectedId}
              aria-label={t(
                "{0}: драматичность {1} из 10",
                card.title || "Без названия",
                dramaValue(card.drama),
              )}
              onMouseEnter={() => setHovered(card.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(card.id)}
              onBlur={() => setHovered(null)}
              onPointerDown={(event) => startDrag(event, card)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
              onClick={() => {
                if (!suppressClick.current) onSelect(card.id);
                suppressClick.current = false;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(card.id);
                }
              }}
            >
              <rect
                className="drama-hit-area"
                x={x - hitWidth / 2}
                y={0}
                width={hitWidth}
                height={height}
                fill="transparent"
              />
              <circle
                className="drama-dot"
                cx={x}
                cy={y}
                r={5}
                fill={card.color || "#33313b"}
                stroke={card.color || "#33313b"}
                strokeWidth={2.5}
              />
              <text x={x} y={y - 13} textAnchor="middle">
                {dramaValue(card.drama)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="outline-drama-preview" aria-live="polite">
        {focused ? (
          <>
            <strong>{focused.title || t("Без названия")}</strong>
            <span>
              {columns.find((column) => column.id === focused.columnId)?.title}{" "}
              · {dramaValue(focused.drama)}/10
            </span>
          </>
        ) : (
          <span>{t("Выберите точку на графике")}</span>
        )}
      </div>
    </aside>
  );
}
