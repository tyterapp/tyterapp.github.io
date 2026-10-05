import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { dramaValue } from "./document-layout.js";

export default function OutlineDramaChart({
  columns,
  cards,
  selectedId,
  onSelect,
  onClose,
}) {
  const plot = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(660);
  const [height, setHeight] = useState(220);
  const [hovered, setHovered] = useState(null);
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
  const width = Math.max(availableWidth, units * 32 + (compact ? 48 : 72), 1);
  const top = 28,
    bottom = height - 42,
    left = compact ? 32 : 48,
    right = width - (compact ? 16 : 24);
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
    return { column, start, end: left + offset * step, points };
  });
  const points = acts.flatMap((act) => act.points);
  const focused = ordered.find((card) => card.id === (hovered || selectedId));
  return (
    <aside className="outline-drama-panel" aria-label="График драматичности">
      <div className="outline-drama-heading">
        <h2>Драматичность истории</h2>
        <button
          className="icon-button"
          aria-label="Закрыть график"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p className="outline-drama-caption">
        Все акты и карточки в порядке аутлайна. Нажмите на точку, чтобы открыть
        карточку.
      </p>
      {!ordered.length && (
        <p className="outline-drama-empty">
          Добавьте карточки и укажите их драматичность от 0 до 10.
        </p>
      )}
      <div className="outline-drama-scroll" ref={plot}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width }}
          role="group"
          aria-label="Драматичность по актам"
        >
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
                <text x={left - 12} y={y + 4} textAnchor="end">
                  {value}
                </text>
              </g>
            );
          })}
          <polyline
            points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="#1b2eff"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          {points.map(({ card, x, y }) => (
            <g
              key={card.id}
              className={
                "outline-drama-point" +
                (card.id === selectedId ? " is-selected" : "")
              }
              role="button"
              tabIndex={0}
              aria-pressed={card.id === selectedId}
              aria-label={`${card.title || "Без названия"}: драматичность ${dramaValue(card.drama)} из 10`}
              onMouseEnter={() => setHovered(card.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(card.id)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelect(card.id)}
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
                fill="white"
                stroke="#1b2eff"
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
            <strong>{focused.title || "Без названия"}</strong>
            <span>
              {columns.find((column) => column.id === focused.columnId)?.title}{" "}
              · {dramaValue(focused.drama)}/10
            </span>
          </>
        ) : (
          <span>Выберите точку на графике</span>
        )}
      </div>
    </aside>
  );
}
