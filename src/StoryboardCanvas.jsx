import { useState, useRef, useEffect } from "react";
import { MessageSquare, ArrowLeft, Send } from "lucide-react";
import { getLanguage } from "./i18n.js";
import { SHOT_FIELDS } from "./shot-info.js";
import { generationDescription } from "./storyboard-generation.js";
import StoryboardFrameGenerator from "./StoryboardFrameGenerator.jsx";
const tr = (ru, en) => (getLanguage() === "en" ? en : ru);
const tools = [
  ["cursor", "Cursor.svg", "Выбор", "Select"],
  ["ellipse", "Circle.svg", "Эллипс", "Ellipse"],
  ["rectangle", "Square.svg", "Прямоугольник", "Rectangle"],
  ["pen", "PenNib.svg", "Перо", "Pen"],
  ["pencil", "Pencil.svg", "Карандаш", "Pencil"],
  ["brush", "PaintBrush.svg", "Кисть", "Brush"],
  ["ai", "Sparkle.svg", "AI", "AI"],
  ["comment", "Chat.svg", "Комментарий", "Comment"],
];
const coord = (event, el) => {
  const r = el.getBoundingClientRect();
  return [
    Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)),
    Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)),
  ];
};
export function Shape({ layer }) {
  const pts = layer.points || [];
  if (!pts.length) return null;
  const a = pts[0],
    b = pts.at(-1);
  const props = {
    stroke: layer.color,
    strokeWidth: layer.width,
    fill: "none",
    vectorEffect: "non-scaling-stroke",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  if (layer.type === "rectangle")
    return (
      <rect
        {...props}
        x={Math.min(a[0], b[0]) * 1000}
        y={Math.min(a[1], b[1]) * 1000}
        width={Math.abs(b[0] - a[0]) * 1000}
        height={Math.abs(b[1] - a[1]) * 1000}
      />
    );
  if (layer.type === "ellipse")
    return (
      <ellipse
        {...props}
        cx={(a[0] + b[0]) * 500}
        cy={(a[1] + b[1]) * 500}
        rx={Math.abs(b[0] - a[0]) * 500}
        ry={Math.abs(b[1] - a[1]) * 500}
      />
    );
  return (
    <polyline
      {...props}
      points={pts.map(([x, y]) => `${x * 1000},${y * 1000}`).join(" ")}
    />
  );
}
export default function StoryboardCanvas({
  frame,
  scene,
  onChange,
  characters = [],
  onGenerate,
}) {
  const [tool, setTool] = useState("cursor"),
    [draft, setDraft] = useState(null),
    [active, setActive] = useState(null),
    [message, setMessage] = useState(""),
    [comment, setComment] = useState(null);
  const [commentMode, setCommentMode] = useState(false);
  const [commentDraft, setCommentDraft] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [commentSearch, setCommentSearch] = useState("");
  const commentInput = useRef(null);
  useEffect(() => {
    if (commentMode && commentDraft) commentInput.current?.focus();
  }, [commentMode, commentDraft]);
  const [aiOpen, setAiOpen] = useState(false),
    [character, setCharacter] = useState(""),
    [shot, setShot] = useState(scene.settings.frameSize || "");
  const drag = useRef(null),
    surface = useRef(null),
    layers = frame.layers || [],
    comments = frame.comments || [];
  const save = (patch) => onChange({ ...frame, ...patch });
  const down = (e) => {
    if (e.button !== 0) return;
    const p = coord(e, surface.current);
    if (tool === "comment") {
      setCommentDraft({ x: p[0], y: p[1] });
      setComment(null);
      setCommentMode(true);
      setAiOpen(false);
      return;
    }
    if (tool === "ai") return;
    if (tool === "cursor") return;
    e.preventDefault();
    surface.current.setPointerCapture(e.pointerId);
    setDraft({
      id: crypto.randomUUID(),
      name: tr("Слой", "Layer") + " " + (layers.length + 1),
      type: tool === "ellipse" || tool === "rectangle" ? tool : "path",
      points: [p, p],
      color: tool === "comment-draw" ? "#e04747" : "#222222",
      width: tool === "brush" ? 8 : 2,
      visible: true,
    });
  };
  const move = (e) => {
    const p = coord(e, surface.current);
    if (drag.current) {
      const d = drag.current;
      setDraft({
        ...d.layer,
        points: d.points.map(([x, y]) => [
          Math.max(0, Math.min(1, x + p[0] - d.start[0])),
          Math.max(0, Math.min(1, y + p[1] - d.start[1])),
        ]),
      });
      return;
    }
    if (!draft) return;
    setDraft({
      ...draft,
      points:
        draft.type === "path" ? [...draft.points, p] : [draft.points[0], p],
    });
  };
  const up = () => {
    if (draft) {
      if (tool === "comment-draw" && comment)
        save({ comments: comments.map((c) => c.id === comment ? { ...c, strokes: [...(c.strokes || []), draft] } : c) });
      else save({
          layers: drag.current
            ? layers.map((l) => (l.id === draft.id ? draft : l))
            : [...layers, draft],
        });
      setActive(draft.id);
      setDraft(null);
    }
    drag.current = null;
  };
  const updateLayer = (id, patch) =>
    save({ layers: layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  return (
    <div className="story-canvas-editor">
      <div className="story-canvas-editor__main">
        <div
          className="story-canvas-editor__surface"
          ref={surface}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => setDraft(null)}
          style={{ touchAction: tool === "cursor" ? "auto" : "none" }}
        >
          {frame.image && <img src={frame.image} alt="" draggable="false" />}
          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-label={tr("Рисунок кадра", "Frame drawing")}
          >
            {[
              ...layers.filter((l) => !draft || l.id !== draft.id),
              ...(draft && tool !== "comment-draw" ? [draft] : []),
            ]
              .filter((l) => l.visible !== false)
              .map((l) => (
                <g
                  key={l.id}
                  onPointerDown={(e) => {
                    if (tool !== "cursor") return;
                    e.stopPropagation();
                    setActive(l.id);
                    drag.current = {
                      id: l.id,
                      start: coord(e, surface.current),
                      points: l.points,
                      layer: l,
                    };
                    surface.current.setPointerCapture(e.pointerId);
                  }}
                >
                  <Shape layer={l} />
                </g>
              ))}
            {commentMode && comment && (comments.find(c => c.id === comment)?.strokes || []).map(stroke => <Shape key={stroke.id} layer={stroke} />)}
            {tool === "comment-draw" && draft && <Shape layer={draft} />}
          </svg>
          {commentDraft && commentMode && (
            <span className="story-canvas-editor__marker story-canvas-editor__marker--draft" style={{ left: `${commentDraft.x * 100}%`, top: `${commentDraft.y * 100}%` }} aria-hidden="true"><MessageSquare size={15}/></span>
          )}
          {comments.map((c, index) => (
            <button
              key={c.id}
              className={`story-canvas-editor__marker${comment === c.id && commentMode ? " story-canvas-editor__marker--active" : ""}`}
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { setComment(c.id); setCommentMode(true); setAiOpen(false); setMessage(""); }}
              aria-label={`${tr("Открыть комментарий", "Open comment")} ${index + 1}`}
              title={c.text}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <div className="story-canvas-editor__tools">
          {tools.map(([id, icon, ru, en]) => (
            <button
              key={id}
              aria-label={tr(ru, en)}
              aria-pressed={tool === id}
              onClick={() => {
                setTool(id);
                if (id === "ai") {
                  setAiOpen(true);
                  setComment(null);
                  setCommentMode(false);
                } else { setAiOpen(false); setCommentMode(id === "comment"); }
              }}
            >
              <img src={`/icons/storyboard-tools/${icon}`} alt="" />
            </button>
          ))}
        </div>
      </div>
      <aside className="story-canvas-editor__side" data-comments-open={commentMode && !aiOpen} aria-label={commentMode && !aiOpen ? tr("Комментарии кадра", "Frame comments") : undefined}>
        {aiOpen ? (
          <>
            <h3>AI</h3>
            <label>
              {tr("Персонаж", "Character")}
              <select
                value={character}
                onChange={(e) => setCharacter(e.target.value)}
              >
                <option value="">—</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Крупность плана", "Shot size")}
              <select value={shot} onChange={(e) => setShot(e.target.value)}>
                <option value="">—</option>
                {SHOT_FIELDS.find((f) => f.key === "frameSize").options.map(
                  ([v, ru, en]) => (
                    <option key={v} value={v}>
                      {tr(ru, en)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <p>
              {tr("Формат кадра", "Aspect ratio")}:{" "}
              {scene.settings.aspectRatio || "16:9"}
            </p>
            <StoryboardFrameGenerator
              key={`${character}:${shot}`}
              scene={{
                ...scene,
                settings: {
                  ...scene.settings,
                  synopsis: [
                    generationDescription(scene),
                    character,
                    SHOT_FIELDS.find((f) => f.key === "frameSize").options.find(
                      (o) => o[0] === shot,
                    )?.[2],
                  ]
                    .filter(Boolean)
                    .join(". "),
                },
              }}
              capacity={Math.max(0, 200 - (scene.settings.frames || []).length)}
              onInsert={onGenerate}
            />
          </>
        ) : commentMode && commentDraft && !comment ? (
          <div className="story-comments">
            <h3>{tr("Новый комментарий", "New comment")}</h3>
            <p className="story-comments__hint">{tr("Комментарий будет закреплён в выбранной точке кадра.", "The comment will be pinned to the selected point.")}</p>
            <form onSubmit={(event) => {
              event.preventDefault();
              const text = commentText.trim();
              if (!text) return;
              const id = crypto.randomUUID();
              save({ comments: [...comments, { id, ...commentDraft, text, replies: [] }] });
              setComment(id); setCommentDraft(null); setCommentText(""); setMessage("");
            }}>
              <textarea ref={commentInput} aria-label={tr("Текст комментария", "Comment text")} placeholder={tr("Напишите замечание…", "Write a comment…")} maxLength={10000} value={commentText} onChange={(event) => setCommentText(event.target.value)} />
              <div className="story-comments__actions">
                <button type="button" className="quiet-button" aria-label={tr("Отменить комментарий", "Cancel comment")} onClick={() => { setCommentDraft(null); setCommentText(""); }}>{tr("Отмена", "Cancel")}</button>
                <button type="submit" className="primary-button" disabled={!commentText.trim()}>{tr("Добавить комментарий", "Add comment")}</button>
              </div>
            </form>
          </div>
        ) : commentMode && comment ? (
          <>
            <button type="button" className="story-comments__back" onClick={() => { setComment(null); setMessage(""); }}><ArrowLeft size={15} /> {tr("Все комментарии", "All comments")}</button>
            <h3>{tr("Комментарий", "Comment")}</h3>
            <p className="story-comments__message">{comments.find((c) => c.id === comment)?.text}</p>
            {comments
              .find((c) => c.id === comment)
              ?.replies.map((r) => (
                <p className="story-comments__message story-comments__message--reply" key={r.id}>{r.text}</p>
              ))}
            <button type="button" className="quiet-button" aria-pressed={tool === "comment-draw"} onClick={() => setTool(tool === "comment-draw" ? "comment" : "comment-draw")}>{tool === "comment-draw" ? tr("Завершить рисование", "Finish drawing") : tr("Нарисовать замечание", "Draw annotation")}</button>
            <form className="story-comments__reply"
              onSubmit={(e) => {
                e.preventDefault();
                if (!message.trim()) return;
                save({
                  comments: comments.map((c) =>
                    c.id === comment
                      ? {
                          ...c,
                          replies: [
                            ...c.replies,
                            { id: crypto.randomUUID(), text: message.trim() },
                          ],
                        }
                      : c,
                  ),
                });
                setMessage("");
              }}
            >
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                aria-label={tr("Ответ", "Reply")}
                placeholder={tr("Напишите ответ…", "Write a reply…")}
                maxLength={10000}
              />
              <button type="submit" className="primary-button" disabled={!message.trim()}><Send size={15}/> {tr("Отправить ответ", "Send reply")}</button>
            </form>
          </>
        ) : commentMode ? (
          <div className="story-comments">
            <h3>{tr("Комментарии кадра", "Frame comments")} <span className="story-comments__count">{comments.length}</span></h3>
            <input type="search" aria-label={tr("Поиск комментариев кадра", "Search frame comments")} placeholder={tr("Поиск комментариев", "Search comments")} value={commentSearch} onChange={(event) => setCommentSearch(event.target.value)} />
            {!comments.length && <p className="story-comments__hint">{tr("Нажмите на кадр, чтобы добавить комментарий.", "Click the frame to add a comment.")}</p>}
            {comments.filter(c => [c.text, ...c.replies.map(r => r.text)].some(text => text.toLocaleLowerCase().includes(commentSearch.trim().toLocaleLowerCase()))).map(c => <button type="button" className="story-comments__item" key={c.id} onClick={() => { setComment(c.id); setMessage(""); }}><MessageSquare size={16}/><span>{c.text}</span></button>)}
          </div>
        ) : (
          <>
            <h3>{tr("Слои", "Layers")}</h3>
            {layers
              .slice()
              .reverse()
              .map((l) => (
                <div key={l.id} className="story-canvas-editor__layer">
                  <input
                    aria-label={tr("Название слоя", "Layer name")}
                    value={l.name}
                    onChange={(e) =>
                      updateLayer(l.id, { name: e.target.value })
                    }
                  />
                  <button
                    aria-label={tr("Удалить слой", "Delete layer")}
                    onClick={() =>
                      save({ layers: layers.filter((a) => a.id !== l.id) })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
          </>
        )}
      </aside>
    </div>
  );
}
