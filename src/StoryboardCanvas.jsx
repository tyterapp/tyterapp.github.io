import { useState, useRef, useEffect } from "react";
import { MessageSquare, ArrowLeft, Send, Eye, EyeOff, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { getLanguage } from "./i18n.js";
import { SHOT_FIELDS } from "./shot-info.js";
import { frameGenerationContext } from "./storyboard-generation.js";
import { frameLayerBounds, moveFrameLayer } from "./storyboard-data.js";
import { storyboardImage } from "./storyboard-image.js";
import { transferFiles } from "./image-thumbnail.js";
import { shotAspectRatio } from "./shot-image.js";
import StoryboardFrameGenerator from "./StoryboardFrameGenerator.jsx";
import "./storyboard-canvas.css";
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
  if (layer.type === "image") return <image href={layer.image} x={Math.min(a[0], b[0]) * 1000} y={Math.min(a[1], b[1]) * 1000} width={Math.abs(b[0] - a[0]) * 1000} height={Math.abs(b[1] - a[1]) * 1000} preserveAspectRatio="none" />;
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
  locations = [],
  showCommentHighlights = true,
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
  const [color, setColor] = useState("#222222");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [pasteError, setPasteError] = useState("");
  const [pasting, setPasting] = useState(false);
  const [surfaceSize, setSurfaceSize] = useState(null);
  const commentInput = useRef(null);
  useEffect(() => {
    if (commentMode && commentDraft) commentInput.current?.focus();
  }, [commentMode, commentDraft]);
  const [aiOpen, setAiOpen] = useState(false),
    [character, setCharacter] = useState(""),
    [location, setLocation] = useState(""),
    [shot, setShot] = useState(scene.settings.frameSize || "");
  const drag = useRef(null),
    stage = useRef(null),
    surface = useRef(null),
    layers = frame.layers || [],
    comments = frame.comments || [];
  const save = (patch) => onChange({ ...frame, ...patch });
  const latest = useRef({ frame, onChange });
  latest.current = { frame, onChange };
  const activeLayer = layers.find((layer) => layer.id === active);
  const selectedBounds = frameLayerBounds(draft?.id === active ? draft : activeLayer || {});
  const generationContext = frameGenerationContext(scene, { frameId: frame.id, character: characters.find((item) => item.id === character), location: locations.find((item) => item.id === location), frameSize: shot });
  const aspectRatio = shotAspectRatio(scene.settings.aspectRatio) || 16 / 9;
  useEffect(() => {
    const fit = () => {
      const width = stage.current?.clientWidth || 1, height = stage.current?.clientHeight || 1;
      const fittedWidth = Math.min(width, height * aspectRatio);
      setSurfaceSize({ width: fittedWidth, height: fittedWidth / aspectRatio });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(stage.current); fit();
    return () => observer.disconnect();
  }, [aspectRatio]);
  useEffect(() => {
    if (active && !layers.some((layer) => layer.id === active)) setActive(null);
  }, [frame.layers, active]);
  useEffect(() => {
    if (!showCommentHighlights && tool === "comment-draw") { setTool("comment"); setDraft(null); }
  }, [showCommentHighlights, tool]);
  useEffect(() => {
    let mounted = true, sequence = Promise.resolve();
    const paste = (event) => {
      if (event.defaultPrevented || event.target.closest?.("input, textarea, select, [contenteditable='true'], dialog")) return;
      const files = transferFiles(event.clipboardData).filter((file) => file.type.startsWith("image/"));
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const room = 500 - (latest.current.frame.layers || []).length;
      if (files.length > room || files.length > 20) { setPasteError(tr("Вставляйте до 20 изображений; в кадре может быть до 500 слоёв.", "Paste up to 20 images; a frame can contain up to 500 layers.")); return; }
      setPasting(true); setPasteError("");
      sequence = sequence.then(async () => {
        try {
          const pasted = [];
          for (const file of files) {
            const image = await storyboardImage(file);
            const bitmap = await createImageBitmap(file);
            const surfaceRatio = surface.current ? surface.current.clientWidth / surface.current.clientHeight : 16 / 9;
            const imageRatio = bitmap.width / bitmap.height;
            bitmap.close();
            const width = Math.min(.8, .8 * imageRatio / surfaceRatio), height = Math.min(.8, .8 * surfaceRatio / imageRatio);
            pasted.push({ id: crypto.randomUUID(), name: file.name || tr("Изображение", "Image"), type: "image", image, points: [[(1 - width) / 2, (1 - height) / 2], [(1 + width) / 2, (1 + height) / 2]], visible: true });
          }
          if (!mounted) return;
          const current = latest.current;
          if ((current.frame.layers || []).length + pasted.length > 500) throw new Error(tr("В кадре уже 500 слоёв.", "This frame already contains 500 layers."));
          current.onChange({ ...current.frame, layers: [...(current.frame.layers || []), ...pasted] });
          setActive(pasted.at(-1).id); setTool("cursor"); setCommentMode(false); setAiOpen(false);
          surface.current?.focus({ preventScroll: true });
        } catch (error) { if (mounted) setPasteError(error.message); }
        finally { if (mounted) setPasting(false); }
      });
    };
    document.addEventListener("paste", paste, true);
    return () => { mounted = false; document.removeEventListener("paste", paste, true); };
  }, [frame.id]);
  const removeLayer = (id) => { save({ layers: layers.filter((layer) => layer.id !== id) }); if (active === id) setActive(null); };
  const reorderLayer = (direction) => {
    const index = layers.findIndex((layer) => layer.id === active), nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) return;
    const next = [...layers]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; save({ layers: next });
  };
  const down = (e) => {
    if (e.button !== 0) return;
    surface.current.focus({ preventScroll: true });
    const p = coord(e, surface.current);
    if (tool === "comment") {
      setCommentDraft({ x: p[0], y: p[1] });
      setComment(null);
      setCommentMode(true);
      setAiOpen(false);
      return;
    }
    if (tool === "ai") return;
    if (tool === "cursor") { setActive(null); return; }
    if (tool === "comment-draw" && !showCommentHighlights) return;
    if (layers.length >= 500) return;
    e.preventDefault();
    surface.current.setPointerCapture(e.pointerId);
    setDraft({
      id: crypto.randomUUID(),
      name: tr("Слой", "Layer") + " " + (layers.length + 1),
      type: tool === "ellipse" || tool === "rectangle" ? tool : "path",
      points: [p, p],
      color: tool === "comment-draw" ? "#e04747" : color,
      width: strokeWidth,
      visible: true,
    });
  };
  const move = (e) => {
    const p = coord(e, surface.current);
    if (drag.current) {
      const d = drag.current;
      setDraft(moveFrameLayer(d.layer, p[0] - d.start[0], p[1] - d.start[1]));
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
    <div className="story-canvas-editor" onKeyDown={(event) => {
      if (event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (["Delete", "Backspace"].includes(event.key) && activeLayer) { event.preventDefault(); event.stopPropagation(); removeLayer(activeLayer.id); }
    }}>
      <div className="story-canvas-editor__main">
        <div className="story-canvas-editor__stage" ref={stage}>
        <div
          className="story-canvas-editor__surface"
          ref={surface}
          tabIndex={0}
          aria-label={tr("Холст кадра", "Frame canvas")}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => { setDraft(null); drag.current = null; }}
          style={{ touchAction: "none", flex: "none", minHeight: 0, ...(surfaceSize || {}) }}
        >
          {frame.image && <img src={frame.image} alt="" draggable="false" style={{ objectFit: "cover" }} />}
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
                  data-layer-id={l.id}
                  pointerEvents={tool === "cursor" ? "bounding-box" : "none"}
                  onPointerDown={(e) => {
                    if (tool !== "cursor" || e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    surface.current.focus({ preventScroll: true });
                    setActive(l.id);
                    drag.current = {
                      id: l.id,
                      start: coord(e, surface.current),
                      layer: l,
                    };
                    surface.current.setPointerCapture(e.pointerId);
                  }}
                >
                  <Shape layer={l} />
                </g>
              ))}
            {activeLayer?.visible !== false && selectedBounds && tool === "cursor" && <rect className="story-canvas-editor__selection" x={selectedBounds.left * 1000} y={selectedBounds.top * 1000} width={Math.max(1, selectedBounds.width * 1000)} height={Math.max(1, selectedBounds.height * 1000)} />}
            {showCommentHighlights && commentMode && comment && (comments.find(c => c.id === comment)?.strokes || []).map(stroke => <g key={stroke.id} pointerEvents="none"><Shape layer={stroke} /></g>)}
            {showCommentHighlights && tool === "comment-draw" && draft && <g pointerEvents="none"><Shape layer={draft} /></g>}
          </svg>
          {showCommentHighlights && commentDraft && commentMode && (
            <span className="story-canvas-editor__marker story-canvas-editor__marker--draft" style={{ left: `${commentDraft.x * 100}%`, top: `${commentDraft.y * 100}%` }} aria-hidden="true"><MessageSquare size={15}/></span>
          )}
          {showCommentHighlights && comments.map((c, index) => (
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
        </div>
        <div className="story-canvas-editor__tools">
          {tools.map(([id, icon, ru, en]) => (
            <button
              key={id}
              aria-label={tr(ru, en)}
              aria-pressed={tool === id}
              onClick={() => {
                setTool(id);
                if (["pen", "pencil", "brush"].includes(id)) setStrokeWidth(id === "brush" ? 8 : id === "pen" ? 2 : 3);
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
        {pasting && <p className="story-canvas-editor__feedback" role="status">{tr("Добавляем изображение…", "Adding image…")}</p>}
        {pasteError && <p className="story-canvas-editor__feedback" role="alert">{pasteError}</p>}
      </div>
      <aside className="story-canvas-editor__side" data-comments-open={commentMode && !aiOpen} aria-label={commentMode && !aiOpen ? tr("Комментарии кадра", "Frame comments") : undefined}>
        {aiOpen ? (
          <>
            <h3>AI</h3>
            <label>
              {tr("Персонаж", "Character")}
              <select
                aria-label={tr("Персонаж", "Character")}
                value={character}
                onChange={(e) => setCharacter(e.target.value)}
              >
                <option value="">—</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Локация", "Location")}
              <select aria-label={tr("Локация", "Location")} value={location} onChange={(event) => setLocation(event.target.value)}>
                <option value="">{scene.settings.location?.name || scene.settings.location?.address || "—"}</option>
                {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              {tr("Крупность плана", "Shot size")}
              <select aria-label={tr("Крупность плана", "Shot size")} value={shot} onChange={(e) => setShot(e.target.value)}>
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
              key={`${character}:${location}:${shot}`}
              scene={scene}
              generationContext={generationContext}
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
            <button type="button" className="quiet-button" disabled={!showCommentHighlights} aria-pressed={tool === "comment-draw"} onClick={() => setTool(tool === "comment-draw" ? "comment" : "comment-draw")}>{tool === "comment-draw" ? tr("Завершить рисование", "Finish drawing") : tr("Нарисовать замечание", "Draw annotation")}</button>
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
            <p className="story-canvas-editor__hint">{tr("Выберите слой на холсте или в списке. Delete — удалить. Ctrl+Z — отменить. Изображения можно вставить из буфера.", "Select a layer on the canvas or in the list. Delete removes it. Ctrl+Z undoes. Paste images from your clipboard.")}</p>
            <div className="story-canvas-editor__brush-settings">
              <label>{tr("Цвет линии", "Stroke color")}<input type="color" aria-label={tr("Цвет линии", "Stroke color")} value={activeLayer && activeLayer.type !== "image" ? activeLayer.color : color} onChange={(event) => { setColor(event.target.value); if (activeLayer && activeLayer.type !== "image") updateLayer(activeLayer.id, { color: event.target.value }); }} /></label>
              <label>{tr("Толщина линии", "Stroke width")}<input type="range" aria-label={tr("Толщина линии", "Stroke width")} min="1" max="40" value={activeLayer && activeLayer.type !== "image" ? activeLayer.width : strokeWidth} onChange={(event) => { const width = Number(event.target.value); setStrokeWidth(width); if (activeLayer && activeLayer.type !== "image") updateLayer(activeLayer.id, { width }); }} /></label>
            </div>
            {activeLayer && <div className="story-canvas-editor__layer-actions">
              <button type="button" aria-label={tr("Поднять слой", "Bring layer forward")} title={tr("Поднять слой", "Bring layer forward")} disabled={layers.at(-1)?.id === active} onClick={() => reorderLayer(1)}><ArrowUp size={16} /></button>
              <button type="button" aria-label={tr("Опустить слой", "Send layer backward")} title={tr("Опустить слой", "Send layer backward")} disabled={layers[0]?.id === active} onClick={() => reorderLayer(-1)}><ArrowDown size={16} /></button>
              <button type="button" aria-label={tr("Удалить выбранный слой", "Delete selected layer")} title={tr("Удалить выбранный слой", "Delete selected layer")} onClick={() => removeLayer(active)}><Trash2 size={16} /></button>
            </div>}
            {!layers.length && <p className="story-canvas-editor__hint">{tr("Выберите карандаш или фигуру и проведите по холсту, чтобы создать слой.", "Choose a pencil or shape and drag on the canvas to create a layer.")}</p>}
            {layers
              .slice()
              .reverse()
              .map((l) => (
                <div key={l.id} className={`story-canvas-editor__layer${active === l.id ? " story-canvas-editor__layer--selected" : ""}`}>
                  <button type="button" aria-label={`${tr("Выбрать слой", "Select layer")}: ${l.name}`} aria-pressed={active === l.id} onClick={() => { setActive(l.id); setTool("cursor"); surface.current?.focus({ preventScroll: true }); }}><span className="story-canvas-editor__layer-number">{layers.indexOf(l) + 1}</span></button>
                  <input
                    aria-label={tr("Название слоя", "Layer name")}
                    value={l.name}
                    onChange={(e) =>
                      updateLayer(l.id, { name: e.target.value })
                    }
                  />
                  <button type="button" aria-label={l.visible === false ? tr("Показать слой", "Show layer") : tr("Скрыть слой", "Hide layer")} onClick={() => updateLayer(l.id, { visible: l.visible === false })}>{l.visible === false ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  <button
                    type="button"
                    aria-label={tr("Удалить слой", "Delete layer")}
                    onClick={() => removeLayer(l.id)}
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
