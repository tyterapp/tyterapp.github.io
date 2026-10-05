import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Columns3,
  ChartLine,
  Copy,
  Crosshair,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { uid } from "./data.js";
import { dramaValue } from "./document-layout.js";
import OutlineDramaChart from "./OutlineDramaChart.jsx";
import "./outline.css";

const COLORS = [
  "#33313b",
  "#d89b17",
  "#aa45ef",
  "#e86847",
  "#609923",
  "#1b2eff",
];
function RemoveDialog({ removing, onClose, onConfirm }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="minimal-dialog"
      aria-label="Удалить из аутлайна"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>
          {removing.kind === "column" ? "Удалить акт?" : "Удалить карточку?"}
        </h2>
        <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <p>
        {removing.kind === "column"
          ? "Акт и его карточки будут удалены. "
          : "Карточка будет удалена. "}
        Текст сцен останется в сценарии.
      </p>
      <div className="dialog-actions">
        <button className="quiet-button" onClick={onClose}>
          Отмена
        </button>
        <button className="primary-button danger" onClick={onConfirm}>
          Удалить
        </button>
      </div>
    </dialog>
  );
}
export default function OutlineBoard({
  outline,
  selectedId,
  onSelect,
  onChange,
  onAddCard,
  onLocate,
  onRelink,
}) {
  const [query, setQuery] = useState("");
  const [showDrama, setShowDrama] = useState(false);
  const [menu, setMenu] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [comment, setComment] = useState("");
  const [draggedId, setDraggedId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const draggedCard = useRef(null);
  const root = useRef(null);
  const { columns = [], cards = [] } = outline || {};
  const selected = cards.find((card) => card.id === selectedId);
  const endDrag = () => {
    draggedCard.current = null;
    setDraggedId(null);
    setDropTarget(null);
  };
  useEffect(() => {
    const close = (event) => {
      if (!event.target.closest(".outline-menu-wrap, .outline-menu"))
        setMenu(null);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        setMenu(null);
        draggedCard.current = null;
        setDraggedId(null);
        setDropTarget(null);
      }
    };
    const scroll = () => setMenu(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    const element = root.current;
    element?.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
      element?.removeEventListener("scroll", scroll, true);
    };
  }, []);
  useEffect(() => setComment(""), [selectedId]);
  const changeCard = (id, fields) =>
    onChange({
      ...outline,
      cards: cards.map((card) =>
        card.id === id ? { ...card, ...fields } : card,
      ),
    });
  const dropPosition = (element, columnId, y) => {
    const targets = [...element.querySelectorAll(".outline-card")].filter(
      (item) => item.dataset.cardId !== draggedCard.current,
    );
    const before = targets.find((item) => {
      const rect = item.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    return { columnId, beforeId: before?.dataset.cardId || null };
  };
  const moveCard = (id, columnId, beforeId) => {
    const card = cards.find((item) => item.id === id);
    if (!card || !columns.some((column) => column.id === columnId)) return;
    const remaining = cards.filter((item) => item.id !== id);
    let index = beforeId
      ? remaining.findIndex(
          (item) => item.id === beforeId && item.columnId === columnId,
        )
      : -1;
    if (index < 0) {
      const last = remaining.findLastIndex(
        (item) => item.columnId === columnId,
      );
      index = last < 0 ? remaining.length : last + 1;
    }
    remaining.splice(
      index,
      0,
      card.columnId === columnId ? card : { ...card, columnId },
    );
    if (remaining.some((item, position) => item !== cards[position]))
      onChange({ ...outline, cards: remaining });
  };
  const addColumn = () =>
    onChange({
      ...outline,
      columns: [
        ...columns,
        { id: uid(), title: "Акт " + (columns.length + 1) },
      ],
    });
  const addTemplate = () => {
    const additions = [1, 2, 3].map((number) => ({
      id: uid(),
      title: "Акт " + number,
    }));
    onChange({ ...outline, columns: [...columns, ...additions] });
  };
  const deleteTarget = () => {
    if (removing.kind === "column")
      onChange({
        ...outline,
        columns: columns.filter((column) => column.id !== removing.id),
        cards: cards.filter((card) => card.columnId !== removing.id),
      });
    else
      onChange({
        ...outline,
        cards: cards.filter((card) => card.id !== removing.id),
      });
    onSelect(null);
    setRemoving(null);
    setMenu(null);
  };
  const menuFor = (kind, item) => (
    <div className="outline-menu-wrap">
      <button
        className="icon-button"
        aria-label={
          kind === "column"
            ? "Действия с актом " + item.title
            : "Действия с карточкой " + item.title
        }
        data-tooltip="Действия"
        aria-expanded={menu?.id === item.id}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu(
            menu?.id === item.id
              ? null
              : {
                  kind,
                  id: item.id,
                  x: Math.max(8, Math.min(rect.right - 220, innerWidth - 228)),
                  y:
                    rect.bottom + 100 < innerHeight
                      ? rect.bottom + 4
                      : Math.max(8, rect.top - 100),
                },
          );
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {menu?.id === item.id &&
        createPortal(
          <div
            className="outline-menu minimal-popover"
            style={{ left: menu.x, top: menu.y }}
          >
            {kind === "column" ? (
              <button
                className="menu-item"
                onClick={() => {
                  setRenaming(item.id);
                  setMenu(null);
                }}
              >
                Переименовать акт
              </button>
            ) : (
              <button
                className="menu-item"
                onClick={() => {
                  onAddCard(item.columnId, item);
                  setMenu(null);
                }}
              >
                <Copy size={15} />
                Дублировать карточку
              </button>
            )}
            <button
              className="menu-item danger"
              onClick={() => {
                setRemoving({ kind, id: item.id });
                setMenu(null);
              }}
            >
              <Trash2 size={15} />
              Удалить
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
  return (
    <div className="outline-layout" ref={root}>
      <section
        className="outline-workspace"
        aria-label="Аутлайн"
        onDragOver={(event) => {
          if (draggedCard.current && !event.target.closest(".outline-column"))
            setDropTarget(null);
        }}
      >
        <div className="outline-tools">
          <button className="quiet-button" onClick={() => setShowDrama(true)}>
            <ChartLine size={17} />
            График драматичности
          </button>
          <button className="quiet-button" onClick={addColumn}>
            <Plus size={17} />
            Добавить акт
          </button>
          {!columns.length && (
            <button className="quiet-button" onClick={addTemplate}>
              <Columns3 size={17} />
              Три акта
            </button>
          )}
          <label className="outline-search">
            <Search size={16} />
            <input
              aria-label="Поиск карточек"
              placeholder="Найти карточку…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                className="icon-button"
                aria-label="Очистить поиск карточек"
                onClick={() => setQuery("")}
              >
                <X size={15} />
              </button>
            )}
          </label>
        </div>
        {!columns.length && (
          <div className="outline-empty">
            <Columns3 size={32} />
            <h1>Сначала — история</h1>
            <p>
              Добавьте акт или начните с трёх актов. Каждая новая карточка
              создаёт сцену в сценарии; тексты можно редактировать независимо.
            </p>
          </div>
        )}
        <div className="outline-columns">
          {columns.map((column) => {
            const visibleCards = cards.filter(
              (card) =>
                card.columnId === column.id &&
                (card.title + "\n" + card.text)
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
            );
            const isTarget = dropTarget?.columnId === column.id;
            const lastTargetId = visibleCards.findLast(
              (card) => card.id !== draggedId,
            )?.id;
            return (
              <section
                className={
                  "outline-column" + (isTarget ? " is-drop-target" : "")
                }
                key={column.id}
                data-column-id={column.id}
                aria-label={column.title}
                onDragOver={(event) => {
                  if (!draggedCard.current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const target = dropPosition(
                    event.currentTarget,
                    column.id,
                    event.clientY,
                  );
                  setDropTarget((previous) =>
                    previous?.columnId === target.columnId &&
                    previous?.beforeId === target.beforeId
                      ? previous
                      : target,
                  );
                }}
                onDrop={(event) => {
                  if (!draggedCard.current) return;
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/tyter-card");
                  if (id === draggedCard.current) {
                    const target = dropPosition(
                      event.currentTarget,
                      column.id,
                      event.clientY,
                    );
                    moveCard(id, column.id, target.beforeId);
                  }
                  endDrag();
                }}
              >
                <header className="outline-column-heading">
                  {renaming === column.id ? (
                    <input
                      autoFocus
                      aria-label="Название акта"
                      value={column.title}
                      onChange={(event) =>
                        onChange({
                          ...outline,
                          columns: columns.map((item) =>
                            item.id === column.id
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        })
                      }
                      onBlur={() => setRenaming(null)}
                      onKeyDown={(event) => {
                        if (["Enter", "Escape"].includes(event.key))
                          setRenaming(null);
                      }}
                    />
                  ) : (
                    <h2>{column.title}</h2>
                  )}
                  <button
                    className="icon-button"
                    aria-label={"Добавить карточку в " + column.title}
                    data-tooltip="Добавить карточку"
                    onClick={() => onAddCard(column.id)}
                  >
                    <Plus size={20} />
                  </button>
                  {menuFor("column", column)}
                </header>
                <div
                  className={
                    "outline-card-list" +
                    (isTarget && !lastTargetId ? " drop-empty" : "")
                  }
                >
                  {visibleCards.map((card) => (
                    <article
                      key={card.id}
                      className={
                        "outline-card" +
                        (selectedId === card.id ? " selected" : "") +
                        (draggedId === card.id ? " is-dragging" : "") +
                        (isTarget && dropTarget.beforeId === card.id
                          ? " drop-before"
                          : "") +
                        (isTarget &&
                        !dropTarget.beforeId &&
                        lastTargetId === card.id
                          ? " drop-after"
                          : "")
                      }
                      data-card-id={card.id}
                      style={{ "--card-color": card.color }}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/tyter-card", card.id);
                        event.dataTransfer.effectAllowed = "move";
                        draggedCard.current = card.id;
                        setDraggedId(card.id);
                        setMenu(null);
                      }}
                      onDragEnd={endDrag}
                    >
                      <div className="outline-card-heading">
                        <button
                          className="outline-card-title"
                          onClick={() => onSelect(card.id)}
                        >
                          <Copy size={17} />
                          <strong>{card.title || "Без названия"}</strong>
                        </button>
                        <button
                          className="icon-button"
                          aria-label={"Перейти к сцене " + card.title}
                          data-tooltip={
                            card.blockId
                              ? "Перейти к сцене"
                              : "Сцена удалена · вставить снова"
                          }
                          onClick={() =>
                            card.blockId ? onLocate(card) : onRelink(card)
                          }
                        >
                          <Crosshair size={18} />
                        </button>
                        {menuFor("card", card)}
                      </div>
                      <button
                        className="outline-card-text"
                        onClick={() => onSelect(card.id)}
                      >
                        {card.text ||
                          "Опишите, что происходит в этой части истории."}
                      </button>
                      {!!card.comments?.length && (
                        <button
                          className="outline-card-comments"
                          onClick={() => onSelect(card.id)}
                        >
                          <MessageSquare size={14} />
                          {card.comments.length} комм.
                        </button>
                      )}
                      <button
                        className="outline-card-drama"
                        onClick={() => onSelect(card.id)}
                        aria-label={`Драматичность карточки ${card.title}: ${dramaValue(card.drama)} из 10`}
                      >
                        <ChartLine size={14} />
                        {dramaValue(card.drama)}/10
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        {query &&
          !cards.some((card) =>
            (card.title + "\n" + card.text)
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase()),
          ) && <p className="outline-no-results">Карточки не найдены</p>}
      </section>
      {selected && (
        <aside
          className="component-drawer outline-card-drawer"
          aria-label="Редактирование карточки"
        >
          <div className="drawer-header">
            <h2>
              <Copy size={17} />
              Карточка истории
            </h2>
            <button
              className="icon-button"
              aria-label="Перейти к сцене карточки"
              data-tooltip="Перейти к сцене"
              onClick={() =>
                selected.blockId ? onLocate(selected) : onRelink(selected)
              }
            >
              <Crosshair size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Закрыть карточку"
              data-tooltip="Закрыть"
              onClick={() => onSelect(null)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="outline-detail-body">
            <label>
              Название
              <input
                aria-label="Название карточки"
                value={selected.title}
                maxLength={200}
                onChange={(event) =>
                  changeCard(selected.id, { title: event.target.value })
                }
              />
            </label>
            <label>
              Текст карточки
              <textarea
                aria-label="Текст карточки"
                value={selected.text}
                maxLength={20000}
                placeholder="Что происходит в истории?"
                onChange={(event) =>
                  changeCard(selected.id, { text: event.target.value })
                }
              />
            </label>
            <p className="outline-detail-note">
              Изменения здесь не заменяют текст сцены в сценарии.
            </p>
            <label>
              Акт
              <select
                aria-label="Акт карточки"
                value={selected.columnId}
                onChange={(event) =>
                  changeCard(selected.id, { columnId: event.target.value })
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
                Драматичность <output>{dramaValue(selected.drama)}/10</output>
              </span>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                aria-label="Драматичность карточки"
                value={dramaValue(selected.drama)}
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
              <legend>Цвет карточки</legend>
              <div>
                {COLORS.map((color, index) => (
                  <button
                    key={color}
                    aria-label={
                      [
                        "Графитовый",
                        "Жёлтый",
                        "Фиолетовый",
                        "Оранжевый",
                        "Зелёный",
                        "Синий",
                      ][index]
                    }
                    aria-pressed={selected.color === color}
                    style={{ "--card-color": color }}
                    onClick={() => changeCard(selected.id, { color })}
                  >
                    <span />
                  </button>
                ))}
              </div>
            </fieldset>
            <section className="outline-comments">
              <h3>
                <MessageSquare size={17} />
                Комментарии
              </h3>
              {(selected.comments || []).map((item) => (
                <div className="outline-comment" key={item.id}>
                  <p>{item.text}</p>
                  <button
                    className="icon-button"
                    aria-label="Удалить комментарий карточки"
                    data-tooltip="Удалить комментарий"
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
                  aria-label="Комментарий карточки"
                  placeholder="Добавить комментарий…"
                  value={comment}
                  maxLength={10000}
                  onChange={(event) => setComment(event.target.value)}
                />
                <button
                  className="icon-button"
                  aria-label="Добавить комментарий карточки"
                  disabled={!comment.trim()}
                >
                  <Plus size={20} />
                </button>
              </form>
            </section>
          </div>
        </aside>
      )}
      {removing && (
        <RemoveDialog
          removing={removing}
          onClose={() => setRemoving(null)}
          onConfirm={deleteTarget}
        />
      )}
      {showDrama && (
        <OutlineDramaChart
          columns={columns}
          cards={cards}
          onSelect={onSelect}
          onClose={() => setShowDrama(false)}
        />
      )}
    </div>
  );
}
