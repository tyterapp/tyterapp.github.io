import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  GripVertical,
  MessageSquare,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { uid } from "./data.js";
import { dramaValue } from "./document-layout.js";
import {
  OUTLINE_STAGES,
  outlineStage,
  outlineStageStyle,
} from "./outline-stages.js";
import "./outline.css";

const WIDTH_KEY = "tyter.dildamode.outline-card-width.v1";
const clampWidth = (value) => Math.max(340, Math.min(480, Math.round(value)));
function readWidth() {
  try {
    return clampWidth(Number(localStorage.getItem(WIDTH_KEY)) || 340);
  } catch {
    return 340;
  }
}
export default function OutlineCardDrawer({
  outline,
  selectedId,
  onSelect,
  onChange,
  onLocate,
  onRelink,
  outlineTarget = false,
}) {
  useLanguage();
  const { columns = [], cards = [] } = outline || {};
  const selected = cards.find((card) => card.id === selectedId);
  const [comment, setComment] = useState("");
  const [width, setWidth] = useState(readWidth);
  const detailBody = useRef(null),
    drag = useRef(null),
    widthRef = useRef(width);
  widthRef.current = width;
  useEffect(() => {
    setComment("");
    detailBody.current?.scrollTo({ top: 0 });
  }, [selectedId]);
  const saveWidth = (value) => {
    try {
      localStorage.setItem(WIDTH_KEY, String(value));
    } catch {}
  };
  const startResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resize = (event) => {
    if (drag.current)
      setWidth(clampWidth(drag.current.width + drag.current.x - event.clientX));
  };
  const finishResize = (event) => {
    if (!drag.current) return;
    drag.current = null;
    saveWidth(widthRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resizeWithKeyboard = (event) => {
    const next =
      event.key === "ArrowLeft"
        ? width + 20
        : event.key === "ArrowRight"
          ? width - 20
          : event.key === "Home"
            ? 340
            : event.key === "End"
              ? 480
              : null;
    if (next == null) return;
    event.preventDefault();
    const value = clampWidth(next);
    setWidth(value);
    saveWidth(value);
  };
  const changeCard = (id, fields) =>
    onChange({
      ...outline,
      cards: cards.map((card) =>
        card.id === id ? { ...card, ...fields } : card,
      ),
    });
  if (!selected) return null;
  return (
    <aside
      className="component-drawer outline-card-drawer"
      aria-label={t("Редактирование карточки")}
      style={{ "--outline-sidebar-width": `${width}px` }}
    >
      <div className="drawer-header">
        <button
          type="button"
          role="separator"
          className="icon-button outline-card-resize"
          aria-label={t("Ширина карточки")}
          aria-orientation="vertical"
          aria-valuemin={340}
          aria-valuemax={480}
          aria-valuenow={width}
          data-tooltip={t("Потяните, чтобы изменить ширину")}
          onPointerDown={startResize}
          onPointerMove={resize}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onKeyDown={resizeWithKeyboard}
        >
          <GripVertical size={16} />
        </button>
        <h2>{t("Карточка истории")}</h2>
        <button
          className="icon-button"
          aria-label={t(
            outlineTarget
              ? "Перейти к карточке в аутлайне"
              : "Перейти к сцене карточки",
          )}
          data-tooltip={t(
            outlineTarget ? "Перейти к карточке в аутлайне" : "Перейти к сцене",
          )}
          onClick={() =>
            selected.blockId ? onLocate(selected) : onRelink(selected)
          }
        >
          <Crosshair size={18} />
        </button>
        <button
          className="icon-button"
          aria-label={t("Закрыть карточку")}
          data-tooltip={t("Закрыть")}
          onClick={() => onSelect(null)}
        >
          <X size={18} />
        </button>
      </div>
      <div className="outline-detail-body" ref={detailBody}>
        <label>
          {t("Название")}
          <textarea
            key={selected.id}
            className="outline-card-name"
            rows={2}
            aria-label={t("Название карточки")}
            value={selected.title}
            maxLength={200}
            onChange={(event) =>
              changeCard(selected.id, {
                title: event.target.value,
              })
            }
          />
        </label>
        <label>
          {t("Текст карточки")}
          <textarea
            aria-label={t("Текст карточки")}
            value={selected.text}
            maxLength={20000}
            placeholder={t("Что происходит в истории?")}
            onChange={(event) =>
              changeCard(selected.id, {
                text: event.target.value,
              })
            }
          />
        </label>
        <p className="outline-detail-note">
          {t("Изменения здесь не заменяют текст сцены в сценарии.")}
        </p>
        <label>
          {t("Акт")}
          <select
            aria-label={t("Акт карточки")}
            value={selected.columnId}
            onChange={(event) =>
              changeCard(selected.id, {
                columnId: event.target.value,
              })
            }
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.title}
              </option>
            ))}
          </select>
        </label>
        <label className="outline-drama-control">
          <span>
            {t("Драматичность ")}
            <output>{dramaValue(selected.drama)}/10</output>
          </span>
          <input
            type="range"
            className="app-range"
            min="0"
            max="10"
            step="1"
            aria-label={t("Драматичность карточки")}
            value={dramaValue(selected.drama)}
            style={{
              "--range-progress": `${dramaValue(selected.drama) * 10}%`,
            }}
            onChange={(event) =>
              changeCard(selected.id, {
                drama: dramaValue(event.target.value),
              })
            }
          />
          <span className="outline-drama-scale">
            <span>0</span>
            <span>10</span>
          </span>
        </label>
        <fieldset className="outline-colors">
          <legend>{t("Этап производства")}</legend>
          <div>
            {OUTLINE_STAGES.map((stage) => (
              <button
                type="button"
                key={stage.id}
                className="outline-stage-choice"
                aria-label={stage.label}
                aria-pressed={outlineStage(selected).id === stage.id}
                data-production-stage={stage.id}
                style={outlineStageStyle(stage)}
                onClick={() =>
                  changeCard(selected.id, {
                    color: stage.color,
                  })
                }
              >
                <span className="outline-stage-swatch" aria-hidden="true" />
                <span>{stage.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <section className="outline-comments">
          <h3>
            <MessageSquare size={17} />
            {t("Комментарии")}
          </h3>
          {(selected.comments || []).map((item) => (
            <div className="outline-comment" key={item.id}>
              <p>{item.text}</p>
              <button
                className="icon-button"
                aria-label={t("Удалить комментарий карточки")}
                data-tooltip={t("Удалить комментарий")}
                onClick={() =>
                  changeCard(selected.id, {
                    comments: selected.comments.filter(
                      (row) => row.id !== item.id,
                    ),
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!comment.trim()) return;
              changeCard(selected.id, {
                comments: [
                  ...(selected.comments || []),
                  {
                    id: uid(),
                    text: comment.trim(),
                    createdAt: new Date().toISOString(),
                  },
                ],
              });
              setComment("");
            }}
          >
            <textarea
              aria-label={t("Комментарий карточки")}
              placeholder={t("Добавить комментарий…")}
              value={comment}
              maxLength={10000}
              onChange={(event) => setComment(event.target.value)}
            />
            <button
              className="icon-button"
              aria-label={t("Добавить комментарий карточки")}
              disabled={!comment.trim()}
            >
              <Plus size={20} />
            </button>
          </form>
        </section>
      </div>
    </aside>
  );
}
