import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  X,
  ImagePlus,
  GripVertical,
  Trash2,
  ChartNoAxesCombined,
  Crop,
  Maximize2,
  MessageSquare,
  Download,
  Play,
} from "lucide-react";
import { getLanguage, t, useLanguage } from "./i18n.js";
import {
  storyboardFrames,
  newFrame,
  playSlides,
  STORY_STATUSES,
} from "./storyboard-data.js";
import { shotText, FORMAT_NAMES } from "./shot-info.js";
import { transferFiles } from "./image-thumbnail.js";
import { storyboardImage } from "./storyboard-image.js";
import { shotAspectRatio } from "./shot-image.js";
import { SCENE_VARIANTS } from "./scene-variants.js";
import ScriptVersionIcon from "./ScriptVersionIcon.jsx";
import ShotInfoDrawer from "./ShotInfoDrawer.jsx";
import StoryboardFrameGenerator from "./StoryboardFrameGenerator.jsx";
import StoryboardPlayer from "./StoryboardPlayer.jsx";
import { scriptVersionExportStyle } from "./script-version-colors.js";
import {
  useStoryboardZoom,
  useLongPressReorder,
} from "./useStoryboardGestures.js";
import "./storyboard.css";

const tr = (ru, en) => (getLanguage() === "en" ? en : ru);
const label = (scene) => `${scene.number} ${scene.letter}`;
const status = (scene) =>
  STORY_STATUSES.find(([id]) => id === scene.settings.status) ||
  STORY_STATUSES[0];

export function StoryboardImage({ scene, ratio, className = "" }) {
  const frames = storyboardFrames(scene.settings).filter(
    (frame) => frame.image,
  );
  const [playing, setPlaying] = useState(null);
  const stop = useRef(null);
  useEffect(() => {
    setPlaying(null);
    return () => stop.current?.();
  }, [scene.id, scene.letter, scene.settings]);
  const start = () => {
    stop.current?.();
    stop.current = playSlides(scene.settings, setPlaying);
  };
  const end = () => {
    stop.current?.();
    stop.current = null;
    setPlaying(null);
  };
  const frame = playing || frames[0];
  return (
    <span
      className={`story-image ${className}`}
      style={{
        aspectRatio:
          ratio || shotAspectRatio(scene.settings.aspectRatio) || 16 / 9,
      }}
      onMouseEnter={start}
      onMouseLeave={end}
      onFocus={start}
      onBlur={end}
    >
      {frame ? (
        <img
          key={frame.id}
          className={frame.transition === "fade" ? "story-image-fade" : ""}
          src={frame.image}
          alt=""
          draggable="false"
        />
      ) : (
        <ImagePlus size={28} aria-hidden="true" />
      )}
      {frames.length > 1 && (
        <span className="story-slide-count">
          <Play size={10} fill="currentColor" />
          {frames.length}
        </span>
      )}
    </span>
  );
}

export function StoryboardBoard({
  scenes,
  selectedId,
  onSelect,
  onFrameSelect,
  onMoveFrame,
  onMove,
  onAdd,
  onExport,
  readonly = false,
}) {
  useLanguage();
  const [playingPage, setPlayingPage] = useState(null);
  const [zoom, setZoom] = useState(() =>
    window.matchMedia("(max-width: 831px)").matches ? 40 : 50,
  );
  const [aspect, setAspect] = useState("16:9");
  const [comments, setComments] = useState(false);
  const [exports, setExports] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const viewport = useRef(null);
  useStoryboardZoom(viewport, zoom, setZoom);
  const reorder = useLongPressReorder(
    ".story-card[data-scene]",
    "data-scene",
    (id, target) => {
      if (!readonly) onMove(id, target);
    },
    ".story-card-select",
  );
  const slideReorder = useLongPressReorder(
    ".story-card-slide[data-slide]",
    "data-slide",
    (source, target) => {
      if (readonly) return;
      const [sceneId, letter, frameId] = JSON.parse(source);
      onMoveFrame(sceneId, letter, frameId, target);
    },
    null,
    ".story-card[data-scene]",
    "data-scene",
  );
  const visible = scenes;
  const pages = [...new Set(visible.map((scene) => scene.page))];
  const ratio =
    aspect === "scene"
      ? null
      : aspect === "1:1"
        ? 1
        : aspect === "9:16"
          ? 9 / 16
          : aspect === "2.39:1"
            ? 2.39
            : 16 / 9;
  useEffect(() => {
    const close = (event) => {
      if (!event.target.closest(".story-export-menu")) setExports(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        setFullscreen(false);
        setExports(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <section
      className={`storyboard-workspace${fullscreen ? " story-fullscreen" : ""}`}
      aria-label={t("Раскадровка")}
    >
      <div
        className="story-board-scroll"
        ref={viewport}
        onClick={(event) => {
          if (!event.target.closest("button, input, select, .story-card"))
            onSelect(null);
        }}
        style={{ "--story-card-width": `${(360 * zoom) / 100}px` }}
      >
        {!scenes.length && (
          <div className="story-empty">
            <Crop size={36} />
            <p>
              {tr(
                "Добавьте первую сцену, чтобы собрать раскадровку.",
                "Add your first scene to start the storyboard.",
              )}
            </p>
          </div>
        )}
        {pages.map((page) => (
          <section
            className="story-page-group"
            key={page}
            aria-label={t("Страница {0}", page)}
          >
            <div className="story-page-label">
              <button
                className="story-page-play"
                aria-label={tr(
                  `Воспроизвести страницу ${page}`,
                  `Play page ${page}`,
                )}
                disabled={
                  !visible.some(
                    (scene) =>
                      scene.page === page &&
                      storyboardFrames(scene.settings).some(
                        (frame) => frame.image,
                      ),
                  )
                }
                onClick={() => setPlayingPage(page)}
              >
                <span>{t("Страница {0}", page)}</span>
                <Play size={14} fill="currentColor" />
              </button>
              <ScriptVersionIcon
                versionId={visible.find((scene) => scene.page === page)?.color}
                size={15}
              />
            </div>
            <div className="story-page-cards">
              {visible
                .filter((scene) => scene.page === page)
                .map((scene) => (
                  <article
                    key={scene.id}
                    className={`story-card${selectedId === scene.id ? " selected" : ""}`}
                    style={{
                      "--story-status":
                        scene.color === "white"
                          ? "var(--ui-accent)"
                          : scriptVersionExportStyle(scene.color).color,
                    }}
                    data-scene={scene.id}
                    data-frame-drop={JSON.stringify(["scene", scene.id])}
                    {...(readonly ? {} : reorder)}
                    draggable={false}
                  >
                    <button
                      className="story-card-select"
                      aria-label={`${tr("Сцена", "Scene")} ${label(scene)}: ${scene.title}`}
                      aria-pressed={selectedId === scene.id}
                      onClick={() => {
                        if (readonly) return;
                        setFullscreen(false);
                        onSelect(scene.id);
                      }}
                    >
                      <StoryboardImage scene={scene} ratio={ratio} />
                      <span className="story-card-caption">
                        <strong>{label(scene)}</strong>
                        <span title={scene.title}>
                          {scene.title || t("Без названия")}
                        </span>
                      </span>
                    </button>
                    {selectedId === scene.id &&
                      storyboardFrames(scene.settings).some(
                        (frame) => frame.image,
                      ) && (
                        <div
                          className="story-card-slides"
                          aria-label={tr("Слайды сцены", "Scene slides")}
                        >
                          {storyboardFrames(scene.settings).map(
                            (frame, index) =>
                              frame.image && (
                                <button
                                  key={frame.id}
                                  className="story-card-slide"
                                  data-slide={JSON.stringify([
                                    scene.id,
                                    scene.letter,
                                    frame.id,
                                  ])}
                                  {...(readonly ? {} : slideReorder)}
                                  draggable={false}
                                  aria-label={`${tr("Открыть слайд", "Open slide")} ${index + 1}`}
                                  title={tr(
                                    "Перетащите на другую сцену",
                                    "Drag onto another scene",
                                  )}
                                  onClick={() =>
                                    onFrameSelect(scene.id, frame.id)
                                  }
                                >
                                  <img
                                    src={frame.image}
                                    alt=""
                                    draggable={false}
                                  />
                                  <small>{index + 1}</small>
                                </button>
                              ),
                          )}
                        </div>
                      )}
                    {comments && scene.settings.frameComment && (
                      <p className="story-card-comment">
                        {scene.settings.frameComment}
                      </p>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))}
        {!readonly && (
          <button
            className="story-add-scene"
            aria-label={tr("Добавить сцену", "Add scene")}
            data-tooltip={tr("Добавить сцену", "Add scene")}
            onClick={onAdd}
          >
            <ImagePlus size={28} />
          </button>
        )}
      </div>
      <footer className="story-viewport-tools">
        <div className="story-export-menu">
          <button
            className="quiet-button"
            aria-expanded={exports}
            onClick={() => setExports(!exports)}
          >
            <Download size={16} />
            {tr("Экспорт раскадровки", "Export storyboard")}
          </button>
          {exports && (
            <div className="story-export-options" role="menu">
              {[
                [
                  "png",
                  "PNG sequence",
                  tr(
                    "Все слайды отдельными файлами · ZIP",
                    "All slides as separate files · ZIP",
                  ),
                ],
                [
                  "webp",
                  "WEBP sequence",
                  tr(
                    "Все слайды отдельными файлами · ZIP",
                    "All slides as separate files · ZIP",
                  ),
                ],
                [
                  "pdf",
                  "PDF",
                  tr("Для чтения и печати", "For reading and printing"),
                ],
                [
                  "json",
                  "JSON",
                  tr(
                    "Слайды, порядок и длительности",
                    "Slides, order and durations",
                  ),
                ],
                [
                  "tyt",
                  "Tyter project · TYT",
                  tr(
                    "Сценарий, раскадровка и все настройки",
                    "Screenplay, storyboard and all settings",
                  ),
                ],
              ].map(([format, name, description]) => (
                <button
                  key={format}
                  role="menuitem"
                  onClick={() => {
                    setExports(false);
                    onExport(format);
                  }}
                >
                  <Download size={18} />
                  <span>
                    <strong>{name}</strong>
                    <small>{description}</small>
                  </span>
                  <small>
                    .{["png", "webp"].includes(format) ? "zip" : format}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="quiet-button"
          aria-pressed={comments}
          onClick={() => setComments(!comments)}
        >
          <MessageSquare size={18} />
          {t("Комментарии")}
        </button>
        <label>
          <span className="sr-only">
            {tr("Формат просмотра", "Viewport aspect ratio")}
          </span>
          <select
            aria-label={tr("Формат просмотра", "Viewport aspect ratio")}
            value={aspect}
            onChange={(e) => setAspect(e.target.value)}
          >
            {["16:9", "9:16", "1:1", "2.39:1", "scene"].map((value) => (
              <option key={value} value={value}>
                {value === "scene"
                  ? tr("Из настроек сцены", "From scene settings")
                  : value}
              </option>
            ))}
          </select>
        </label>
        <label className="story-zoom">
          <span>{zoom}%</span>
          <input
            aria-label={tr("Масштаб раскадровки", "Storyboard zoom")}
            type="range"
            min="20"
            max="100"
            step="5"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <button
          className="icon-button"
          aria-label={tr("На весь экран", "Full screen")}
          aria-pressed={fullscreen}
          onClick={() => setFullscreen(!fullscreen)}
        >
          <Maximize2 size={18} />
        </button>
      </footer>
      {playingPage !== null && (
        <StoryboardPlayer
          key={playingPage}
          scenes={scenes}
          page={playingPage}
          onClose={() => setPlayingPage(null)}
        />
      )}
    </section>
  );
}

function StoryDrama({ scenes, selectedId, onSelect, onChange }) {
  const width = Math.max(280, scenes.length * 42),
    height = 170;
  const points = scenes.map((scene, index) => ({
    scene,
    x: 26 + index * ((width - 45) / Math.max(1, scenes.length - 1)),
    y: 132 - (scene.settings.drama || 0) * 11,
  }));
  return (
    <div
      className="story-drama"
      aria-label={tr("График драматургии", "Drama chart")}
    >
      <div className="story-drama-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width }}
          role="group"
          aria-label={tr(
            "Драматичность сцен от 0 до 10",
            "Scene drama from 0 to 10",
          )}
        >
          {[0, 5, 10].map((value) => (
            <g key={value}>
              <line
                x1="22"
                x2={width - 8}
                y1={132 - value * 11}
                y2={132 - value * 11}
                className="story-chart-grid"
              />
              <text x="4" y={136 - value * 11}>
                {value}
              </text>
            </g>
          ))}
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="var(--ui-accent)"
            strokeWidth="2"
          />
          {points.map(({ scene, x, y }) => (
            <g key={scene.id}>
              <circle
                cx={x}
                cy={y}
                r="18"
                fill="transparent"
                role="button"
                tabIndex="0"
                aria-label={`${label(scene)}: ${scene.settings.drama || 0}/10`}
                onClick={() => onSelect(scene.id)}
                onKeyDown={(e) => {
                  if (["Enter", " "].includes(e.key)) {
                    e.preventDefault();
                    onSelect(scene.id);
                  }
                  if (["ArrowUp", "ArrowDown"].includes(e.key)) {
                    e.preventDefault();
                    onChange(scene.id, {
                      drama: Math.max(
                        0,
                        Math.min(
                          10,
                          (scene.settings.drama || 0) +
                            (e.key === "ArrowUp" ? 1 : -1),
                        ),
                      ),
                    });
                  }
                }}
              />
              <circle
                className="story-chart-dot"
                cx={x}
                cy={y}
                r={scene.id === selectedId ? 6 : 4}
                fill={status(scene)[3]}
                pointerEvents="none"
              />
              <text x={x} y="155" textAnchor="middle">
                {label(scene)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <small>
        {tr(
          "По порядку сцен · ↑ ↓ меняют оценку выбранной точки",
          "In scene order · ↑ ↓ adjust the focused point",
        )}
      </small>
    </div>
  );
}

function FrameEditor({
  scene,
  scenes,
  onChange,
  onMoveFrame,
  scope,
  frameTarget,
}) {
  const frames = storyboardFrames(scene.settings);
  const [selected, setSelected] = useState(
    frameTarget?.frameId || frames[0]?.id,
  );
  const [moveTarget, setMoveTarget] = useState("");
  useEffect(() => {
    if (frameTarget?.frameId) setSelected(frameTarget.frameId);
  }, [frameTarget]);
  const [error, setError] = useState("");
  const input = useRef(null),
    uploadTarget = useRef(null),
    live = useRef(scope);
  live.current = scope;
  useEffect(
    () => () => {
      live.current = null;
    },
    [],
  );
  const liveFrames = useRef(frames);
  liveFrames.current = frames;
  const reorder = useLongPressReorder(
    ".story-frame-slot[data-frame]",
    "data-frame",
    (id, target) => {
      const [kind, targetId] = JSON.parse(target);
      if (kind === "scene") {
        onMoveFrame(scene.id, scene.letter, id, targetId);
        return;
      }
      const next = [...liveFrames.current],
        from = next.findIndex((frame) => frame.id === id),
        to = next.findIndex((frame) => frame.id === targetId);
      if (from < 0 || to < 0) return;
      next.splice(to, 0, ...next.splice(from, 1));
      onChange({ frames: next });
    },
    null,
    ".story-frame-slot[data-frame],.story-card[data-scene]",
    "data-frame-drop",
  );
  const current = frames.find((frame) => frame.id === selected) || frames[0];
  const setFrames = (value) => onChange({ frames: value });
  const patch = (value) =>
    setFrames(
      frames.map((frame) =>
        frame.id === current.id ? { ...frame, ...value } : frame,
      ),
    );
  const upload = async (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    const token = live.current,
      target = uploadTarget.current;
    if (!files.length) return;
    try {
      const images = await Promise.all(
        files.map((file) => storyboardImage(file)),
      );
      if (live.current !== token) return;
      let next = [...liveFrames.current];
      const index = next.findIndex((frame) => frame.id === target);
      if (index >= 0) next[index] = { ...next[index], image: images.shift() };
      const added = images.map(newFrame);
      next.push(...added);
      if (next.length > 200)
        throw new Error(
          tr(
            "В сцене может быть до 200 слайдов.",
            "A scene can have up to 200 slides.",
          ),
        );
      setFrames(next);
      setSelected(index >= 0 ? next[index].id : added[0]?.id);
      setError("");
    } catch (cause) {
      if (live.current === token) setError(cause.message);
    }
  };
  return (
    <div className="story-frame-editor">
      <StoryboardFrameGenerator
        scene={scene}
        capacity={
          200 - frames.length + frames.filter((frame) => !frame.image).length
        }
        onInsert={(images) => {
          const next = [...liveFrames.current],
            remaining = [...images];
          if (
            images.length >
            200 - next.length + next.filter((frame) => !frame.image).length
          )
            return false;
          let firstId;
          for (let index = 0; index < next.length && remaining.length; index++)
            if (!next[index].image) {
              next[index] = { ...next[index], image: remaining.shift() };
              firstId ||= next[index].id;
            }
          const added = remaining.map(newFrame);
          onChange({ frames: [...next, ...added] });
          setSelected(firstId || added[0]?.id);
          return true;
        }}
      />
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={upload}
      />
      <div className="story-frame-grid">
        {frames.map((frame, index) => (
          <button
            key={frame.id}
            data-frame={frame.id}
            data-frame-drop={JSON.stringify(["frame", frame.id])}
            {...reorder}
            className={`story-frame-slot${current?.id === frame.id ? " selected" : ""}`}
            draggable={false}
            aria-label={`${tr("Слайд", "Slide")} ${index + 1}${frame.image ? "" : ` · ${tr("Свободный слот", "Empty slot")}`}`}
            aria-pressed={current?.id === frame.id}
            onClick={() => setSelected(frame.id)}
            onDoubleClick={() => {
              uploadTarget.current = frame.id;
              input.current.click();
            }}
          >
            <span
              style={{
                aspectRatio:
                  shotAspectRatio(scene.settings.aspectRatio) || 16 / 9,
              }}
            >
              {frame.image ? (
                <img src={frame.image} alt="" draggable="false" />
              ) : (
                <ImagePlus size={20} />
              )}
            </span>
            <small>
              {index + 1} · {(frame.durationMs / 1000).toLocaleString()}s
            </small>
          </button>
        ))}
        <button
          className="story-frame-slot story-new-slot"
          onClick={() => {
            const frame = newFrame();
            setFrames([...frames, frame]);
            setSelected(frame.id);
          }}
          disabled={frames.length >= 200}
          aria-label={tr("Добавить свободный слот", "Add empty slot")}
        >
          <Plus size={20} />
        </button>
      </div>
      <button
        className="quiet-button"
        onClick={() => {
          uploadTarget.current = null;
          input.current.click();
        }}
        disabled={frames.length >= 200}
      >
        <ImagePlus size={17} />
        {tr("Добавить изображения", "Add images")}
      </button>
      {current && (
        <section className="story-slide-settings">
          <div className="story-slide-actions">
            <strong>
              {tr("Слайд", "Slide")} {frames.indexOf(current) + 1}
            </strong>
            <button
              className="icon-button"
              aria-label={tr("Удалить слайд", "Delete slide")}
              onClick={() =>
                setFrames(frames.filter((frame) => frame.id !== current.id))
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
          {current.image && (
            <img
              className="story-slide-preview"
              src={current.image}
              alt={tr("Выбранный слайд", "Selected slide")}
            />
          )}
          <button
            className="quiet-button"
            onClick={() => {
              uploadTarget.current = current.id;
              input.current.click();
            }}
          >
            <ImagePlus size={16} />
            {current.image
              ? t("Заменить картинку")
              : tr("Заполнить слот", "Fill slot")}
          </button>
          <label>
            {tr("Длительность, секунды", "Duration, seconds")}
            <input
              type="number"
              min="0.1"
              max="600"
              step="0.1"
              value={current.durationMs / 1000}
              onChange={(e) => {
                if (e.target.value)
                  patch({ durationMs: Number(e.target.value) * 1000 });
              }}
            />
          </label>
          <label>
            {tr("Переход к слайду", "Slide transition")}
            <select
              value={current.transition}
              onChange={(e) => patch({ transition: e.target.value })}
            >
              <option value="cut">{tr("Склейка", "Cut")}</option>
              <option value="fade">{tr("Плавное появление", "Fade in")}</option>
            </select>
          </label>
          <div className="story-slide-actions">
            {[-1, 1].map((direction) => (
              <button
                key={direction}
                className="quiet-button"
                disabled={
                  frames.indexOf(current) + direction < 0 ||
                  frames.indexOf(current) + direction >= frames.length
                }
                aria-label={
                  direction < 0
                    ? tr("Слайд раньше", "Move slide earlier")
                    : tr("Слайд позже", "Move slide later")
                }
                onClick={() => {
                  const next = [...frames],
                    from = next.indexOf(current);
                  next.splice(from + direction, 0, ...next.splice(from, 1));
                  setFrames(next);
                }}
              >
                {direction < 0 ? (
                  <ArrowLeft size={17} />
                ) : (
                  <ArrowRight size={17} />
                )}
              </button>
            ))}
          </div>
        </section>
      )}
      <label className="story-checkbox">
        <input
          type="checkbox"
          checked={scene.settings.playbackLoop !== false}
          onChange={(e) => onChange({ playbackLoop: e.target.checked })}
        />
        {tr("Повторять при наведении", "Loop on hover")}
      </label>
      {current && scenes.length > 1 && (
        <div className="story-move-frame">
          <label>
            {tr("Переместить слайд в сцену", "Move slide to scene")}
            <select
              aria-label={tr(
                "Сцена для переноса слайда",
                "Slide destination scene",
              )}
              value={moveTarget}
              onChange={(event) => setMoveTarget(event.target.value)}
            >
              <option value="">{tr("Выберите сцену", "Choose a scene")}</option>
              {scenes
                .filter((item) => item.id !== scene.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {label(item)} · {item.title || t("Без названия")}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="quiet-button"
            disabled={
              !scenes.some(
                (item) => item.id === moveTarget && item.id !== scene.id,
              )
            }
            onClick={() =>
              onMoveFrame(scene.id, scene.letter, current.id, moveTarget)
            }
          >
            <ArrowRight size={16} />
            {tr("Переместить слайд", "Move slide")}
          </button>
        </div>
      )}
      <p className="story-help">
        {tr(
          "Наведите на карточку для просмотра. Вставка из буфера предложит свободные слоты.",
          "Hover over a card to preview. Paste images to choose empty slots.",
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
    </div>
  );
}

export function StoryboardInspector({
  scene,
  scenes,
  view,
  scope,
  onView,
  onClose,
  onSelect,
  onVariant,
  onChange,
  onBlock,
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onExport,
  busy,
  frameTarget,
  onMoveFrame,
}) {
  useLanguage();
  const [tab, setTab] = useState("structure"),
    [info, setInfo] = useState("frames"),
    [chart, setChart] = useState(false);
  const [addFormat, setAddFormat] = useState("action");
  useEffect(() => {
    if (frameTarget) {
      setTab("info");
      setInfo("frames");
    }
  }, [frameTarget]);
  const [expanded, setExpanded] = useState(null),
    [adding, setAdding] = useState(false);
  const blockReorder = useLongPressReorder(
    '.story-structure-block[data-block]:not([data-format="scene"])',
    "data-block",
    onMoveBlock,
    ".story-drag-handle",
  );
  const frames = storyboardFrames(scene.settings),
    index = scenes.findIndex((item) => item.id === scene.id);
  return (
    <aside className="story-inspector" aria-label={t("Раскадровка")}>
      <header className="story-inspector-top">
        <button
          className="quiet-button"
          onClick={() =>
            onView(view === "storyboard" ? "screenplay" : "storyboard")
          }
        >
          <ArrowLeft size={17} />
          {view === "storyboard"
            ? tr("Вернуться к сценарию", "Return to screenplay")
            : tr("Посмотреть раскадровку", "View storyboard")}
        </button>
        <button
          className="icon-button"
          aria-label={t("Закрыть")}
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div
        className="story-tabs"
        role="tablist"
        aria-label={tr("Панель сцены", "Scene panel")}
      >
        {[
          ["structure", tr("Структура", "Structure")],
          ["info", tr("Инфо", "Info")],
        ].map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="story-inspector-scroll">
        <button
          className="story-filmstrip"
          aria-label={tr("Открыть слайды", "Open slides")}
          onClick={() => {
            setTab("info");
            setInfo("frames");
          }}
        >
          <span>
            {frames.length ? (
              frames
                .slice(0, 4)
                .map((frame) => (
                  <span key={frame.id}>
                    {frame.image ? (
                      <img src={frame.image} alt="" />
                    ) : (
                      <ImagePlus size={18} />
                    )}
                  </span>
                ))
            ) : (
              <ImagePlus size={24} />
            )}
          </span>
          <small>
            {frames.length} {tr("слайдов", "slides")}
            <span>
              {frames
                .reduce((sum, frame) => sum + frame.durationMs, 0)
                .toLocaleString()}{" "}
              ms
            </span>
          </small>
        </button>
        <div className="story-scene-nav">
          <button
            className="quiet-button"
            disabled={index <= 0}
            aria-label={tr("Предыдущая сцена", "Previous scene")}
            onClick={() => onSelect(scenes[index - 1].id)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            className="quiet-button"
            disabled={index >= scenes.length - 1}
            aria-label={tr("Следующая сцена", "Next scene")}
            onClick={() => onSelect(scenes[index + 1].id)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="story-scene-title">
          <button
            className="story-heading-toggle"
            aria-label={tr("Изменить заголовок сцены", "Edit scene heading")}
            aria-expanded={expanded === scene.id}
            onClick={() => {
              setTab("structure");
              setExpanded(expanded === scene.id ? null : scene.id);
            }}
          >
            {scene.title.trim().split(/\s+/)[0] || tr("Заголовок", "Heading")}
          </button>
          <span>{scene.number}</span>
          <select
            aria-label={t("Вариант сцены {0}", scene.number)}
            value={scene.letter}
            onChange={(e) => onVariant(scene.id, e.target.value)}
          >
            {SCENE_VARIANTS.map((letter) => (
              <option key={letter}>{letter}</option>
            ))}
          </select>
        </div>
        {tab === "structure" ? (
          <section
            className="story-structure"
            role="tabpanel"
            aria-label={tr("Структура", "Structure")}
          >
            {scene.blocks.map((block, blockIndex) => (
              <div
                className="story-structure-block"
                key={block.attrs.blockId}
                data-block={block.attrs.blockId}
                data-format={block.attrs.format}
                {...(blockIndex ? blockReorder : {})}
              >
                <div className="story-block-row" hidden={!blockIndex}>
                  <button
                    className="icon-button story-drag-handle"
                    disabled={!blockIndex}
                    draggable={false}
                    aria-label={tr("Переместить блок", "Move block")}
                  >
                    <GripVertical size={16} />
                  </button>
                  <button
                    className="story-block-title"
                    aria-expanded={expanded === block.attrs.blockId}
                    onClick={() =>
                      setExpanded(
                        expanded === block.attrs.blockId
                          ? null
                          : block.attrs.blockId,
                      )
                    }
                  >
                    {tr(
                      ...(FORMAT_NAMES[block.attrs.format] ||
                        FORMAT_NAMES.plain),
                    )}
                  </button>
                </div>
                <div
                  className="story-block-editor"
                  hidden={expanded !== block.attrs.blockId}
                >
                  <textarea
                    aria-label={`${tr(...(FORMAT_NAMES[block.attrs.format] || FORMAT_NAMES.plain))} ${blockIndex + 1}`}
                    value={shotText(block)}
                    rows={Math.min(
                      8,
                      Math.max(2, Math.ceil(shotText(block).length / 30)),
                    )}
                    onChange={(e) =>
                      onBlock(block.attrs.blockId, { text: e.target.value })
                    }
                  />
                  {!!blockIndex && (
                    <div className="story-block-tools">
                      <button
                        className="icon-button"
                        aria-label={tr("Удалить блок", "Delete block")}
                        onClick={() => onRemoveBlock(block.attrs.blockId)}
                      >
                        <Trash2 size={14} />
                      </button>
                      <select
                        aria-label={tr("Тип блока", "Block type")}
                        value={block.attrs.format}
                        onChange={(e) =>
                          onBlock(block.attrs.blockId, {
                            format: e.target.value,
                          })
                        }
                      >
                        {Object.entries(FORMAT_NAMES)
                          .filter(([id]) => id !== "scene")
                          .map(([id, names]) => (
                            <option key={id} value={id}>
                              {tr(...names)}
                            </option>
                          ))}
                      </select>
                      <button
                        disabled={blockIndex === 1}
                        className="icon-button"
                        aria-label={tr("Блок выше", "Move block up")}
                        onClick={() =>
                          onMoveBlock(
                            block.attrs.blockId,
                            scene.blocks[blockIndex - 1].attrs.blockId,
                          )
                        }
                      >
                        ↑
                      </button>
                      <button
                        disabled={blockIndex === scene.blocks.length - 1}
                        className="icon-button"
                        aria-label={tr("Блок ниже", "Move block down")}
                        onClick={() =>
                          onMoveBlock(
                            block.attrs.blockId,
                            scene.blocks[blockIndex + 1].attrs.blockId,
                          )
                        }
                      >
                        ↓
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="story-add-block">
              {adding && (
                <>
                  <select
                    aria-label={tr("Тип нового блока", "New block type")}
                    value={addFormat}
                    onChange={(e) => setAddFormat(e.target.value)}
                  >
                    {Object.entries(FORMAT_NAMES)
                      .filter(([id]) => id !== "scene")
                      .map(([id, names]) => (
                        <option key={id} value={id}>
                          {tr(...names)}
                        </option>
                      ))}
                  </select>
                  <button
                    className="quiet-button"
                    onClick={() => {
                      onAddBlock(addFormat);
                      setAdding(false);
                    }}
                  >
                    <Plus size={16} />
                    {tr("Добавить", "Add")}
                  </button>
                </>
              )}
              {!adding && (
                <button
                  className="quiet-button"
                  onClick={() => setAdding(true)}
                >
                  <span>{tr("Добавить блок текста", "Add text block")}</span>
                  <Plus size={14} />
                </button>
              )}
            </div>
          </section>
        ) : (
          <section role="tabpanel" aria-label={tr("Инфо", "Info")}>
            <div
              className="story-tabs story-info-tabs"
              role="tablist"
              aria-label={tr("Сведения о сцене", "Scene info")}
            >
              {[
                ["frames", "FRAMES"],
                ["details", "DETAILS"],
              ].map(([id, name]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={info === id}
                  onClick={() => setInfo(id)}
                >
                  {name}
                </button>
              ))}
            </div>
            <button
              className="quiet-button story-chart-toggle"
              aria-pressed={chart}
              onClick={() => setChart(!chart)}
            >
              <ChartNoAxesCombined size={17} />
              {tr("График драматургии", "Drama chart")}
            </button>
            {chart && (
              <StoryDrama
                scenes={scenes}
                selectedId={scene.id}
                onSelect={onSelect}
                onChange={onChange}
              />
            )}
            {info === "frames" ? (
              <FrameEditor
                key={`${scope}:${scene.id}:${scene.letter}`}
                scope={`${scope}:${scene.id}:${scene.letter}`}
                scene={scene}
                scenes={scenes}
                frameTarget={frameTarget}
                onMoveFrame={onMoveFrame}
                onChange={(patch) => onChange(scene.id, patch)}
              />
            ) : (
              <>
                <div className="story-scene-details">
                  <label>
                    {tr("Акт", "Act")}
                    <input
                      aria-label={tr("Номер акта", "Act number")}
                      type="number"
                      min="1"
                      max="99"
                      value={scene.settings.act || 1}
                      onChange={(e) => {
                        if (e.target.value)
                          onChange(scene.id, { act: Number(e.target.value) });
                      }}
                    />
                  </label>
                  <label>
                    {tr("Статус", "Status")}
                    <select
                      aria-label={tr("Статус сцены", "Scene status")}
                      value={scene.settings.status || "draft"}
                      onChange={(e) =>
                        onChange(scene.id, { status: e.target.value })
                      }
                    >
                      {STORY_STATUSES.map(([id, ru, en]) => (
                        <option key={id} value={id}>
                          {tr(ru, en)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr("Драматичность", "Drama")}
                    <output>{scene.settings.drama || 0}/10</output>
                    <input
                      aria-label={tr("Драматичность", "Drama")}
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={scene.settings.drama || 0}
                      onChange={(e) =>
                        onChange(scene.id, { drama: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    {tr("Что происходит в сцене", "What happens in the scene")}
                    <textarea
                      aria-label={tr("Описание сцены", "Scene synopsis")}
                      rows="4"
                      value={scene.settings.synopsis || ""}
                      maxLength="20000"
                      onChange={(e) =>
                        onChange(scene.id, { synopsis: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t("Комментарии")}
                    <textarea
                      aria-label={tr(
                        "Комментарий раскадровки",
                        "Storyboard comment",
                      )}
                      rows="3"
                      maxLength="20000"
                      value={scene.settings.frameComment || ""}
                      onChange={(e) =>
                        onChange(scene.id, { frameComment: e.target.value })
                      }
                    />
                  </label>
                </div>
                <ShotInfoDrawer
                  scene={scene}
                  embedded
                  onChange={(patch) => onChange(scene.id, patch)}
                  onGo={() => onView("screenplay")}
                  onExport={onExport}
                  busy={busy}
                />
              </>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}

export function StoryboardPaste({
  view,
  scope,
  scenes,
  selectedId,
  onFill,
  onAppend,
  onError,
  enabled,
}) {
  const [pending, setPending] = useState(null),
    [slot, setSlot] = useState("");
  const dialog = useRef(null),
    latest = useRef({
      scope,
      scenes,
      onFill,
      onAppend,
      selectedId,
      enabled,
      view,
    }),
    request = useRef(0);
  latest.current = {
    scope,
    scenes,
    onFill,
    onAppend,
    selectedId,
    enabled,
    view,
  };
  useEffect(() => {
    request.current++;
    setPending(null);
  }, [scope, enabled]);
  useEffect(() => {
    const paste = async (event) => {
      const state = latest.current;
      if (
        !state.enabled ||
        event.target.closest(
          "dialog, .component-form, .prop-form, input, textarea, select",
        )
      )
        return;
      if (
        state.view !== "storyboard" &&
        !event.target.closest(
          ".storyboard-workspace, .story-inspector, .script-paper",
        )
      )
        return;
      const files = transferFiles(event.clipboardData).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const token = ++request.current,
        sourceScope = state.scope;
      const scene = state.scenes.find((item) => item.id === state.selectedId);
      try {
        if (files.length > 50)
          throw new Error(
            tr(
              "Вставляйте не больше 50 изображений за раз.",
              "Paste up to 50 images at a time.",
            ),
          );
        const images = await Promise.all(
          files.slice(0, 50).map((file) => storyboardImage(file)),
        );
        if (
          token !== request.current ||
          sourceScope !== latest.current.scope ||
          !latest.current.enabled ||
          state.view !== latest.current.view
        )
          return;
        if (state.view === "storyboard") {
          if (
            state.selectedId !== latest.current.selectedId ||
            (scene &&
              latest.current.scenes.find((item) => item.id === scene.id)
                ?.letter !== scene.letter)
          )
            return;
          latest.current.onAppend(images, scene?.id, scene?.letter);
          return;
        }
        const available = latest.current.scenes.flatMap((scene) =>
          storyboardFrames(scene.settings)
            .filter((frame) => !frame.image)
            .map((frame) => ({ scene, frame })),
        );
        const first =
          available.find(({ scene }) => scene.id === state.selectedId) ||
          available[0];
        setSlot(
          first
            ? `${first.scene.id}:${first.scene.letter}:${first.frame.id}`
            : `${state.selectedId || state.scenes[0]?.id}:new`,
        );
        setPending(images);
      } catch (error) {
        if (token === request.current) onError(error.message);
      }
    };
    document.addEventListener("paste", paste, true);
    return () => {
      request.current++;
      document.removeEventListener("paste", paste, true);
    };
  }, [onError]);
  useEffect(() => {
    if (pending) {
      dialog.current?.showModal();
      return () => dialog.current?.close();
    }
  }, [pending]);
  if (!pending) return null;
  const options = scenes.flatMap((scene) => [
    ...storyboardFrames(scene.settings).flatMap((frame, index) =>
      frame.image
        ? []
        : [
            {
              value: `${scene.id}:${scene.letter}:${frame.id}`,
              scene,
              frameId: frame.id,
              name: `${label(scene)} · ${tr("Свободный слот", "Empty slot")} ${index + 1}`,
            },
          ],
    ),
    ...(storyboardFrames(scene.settings).length < 200
      ? [
          {
            value: `${scene.id}:new`,
            scene,
            name: `${label(scene)} · ${tr("Новый слайд", "New slide")}`,
          },
        ]
      : []),
  ]);
  return (
    <dialog
      className="story-paste-dialog"
      ref={dialog}
      aria-labelledby="story-paste-title"
      onCancel={() => setPending(null)}
    >
      <header>
        <h2 id="story-paste-title">
          {tr("Куда добавить изображение?", "Where should the image go?")}
        </h2>
        <button
          className="icon-button"
          aria-label={t("Закрыть")}
          onClick={() => setPending(null)}
        >
          <X size={18} />
        </button>
      </header>
      <img src={pending[0]} alt={tr("Из буфера обмена", "From clipboard")} />
      <label>
        {tr("Свободные слоты и сцены", "Empty slots and scenes")}
        <select value={slot} onChange={(e) => setSlot(e.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {pending.length > 1 && (
        <p>
          {tr(
            "Остальные изображения станут новыми слайдами этой сцены.",
            "The other images will become new slides in this scene.",
          )}
        </p>
      )}
      <button
        className="primary-button"
        disabled={!options.some((option) => option.value === slot)}
        onClick={() => {
          const option = options.find((item) => item.value === slot);
          if (!option) return;
          onFill(option.scene.id, option.scene.letter, option.frameId, pending);
          setPending(null);
        }}
      >
        {tr("Добавить", "Add")}
      </button>
    </dialog>
  );
}
