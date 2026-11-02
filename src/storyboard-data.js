export const STORY_STATUSES = [
  ["draft", "Черновик", "Draft", "#98939f"],
  ["pre-production", "Подготовка", "Pre-production", "#7799d5"],
  ["production", "Съёмка", "Production", "#dba356"],
  ["post-production", "Монтаж", "Post-production", "#ad8bd4"],
  ["done", "Готово", "Done", "#85bc92"],
];
export const validFrameImage = (value) =>
  typeof value === "string" &&
  value.length < 8 * 1024 * 1024 &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
export const frameDuration = (value) =>
  Math.max(
    100,
    Math.min(
      600000,
      Math.round(Number.isFinite(Number(value)) ? Number(value) || 5000 : 5000),
    ),
  );
export const newFrame = (image = "") => ({
  id: crypto.randomUUID(),
  image,
  durationMs: 5000,
  transition: "cut",
});
const coordinate = (value) => Math.max(0, Math.min(1, Number(value) || 0));
export function frameLayerBounds(layer) {
  const points = layer.points || [];
  if (!points.length) return null;
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
export function moveFrameLayer(layer, dx, dy) {
  const bounds = frameLayerBounds(layer);
  if (!bounds) return layer;
  const x = Math.max(-bounds.left, Math.min(1 - bounds.left - bounds.width, dx));
  const y = Math.max(-bounds.top, Math.min(1 - bounds.top - bounds.height, dy));
  return { ...layer, points: layer.points.map(([px, py]) => [Math.round((px + x) * 1e8) / 1e8, Math.round((py + y) * 1e8) / 1e8]) };
}
function cleanFrameLayers(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 500).filter((item) => item && typeof item.id === "string" && ["path", "rectangle", "ellipse", "image"].includes(item.type) && (item.type !== "image" || validFrameImage(item.image))).map((item) => ({
    id: item.id.slice(0, 100), name: String(item.name || "Layer").slice(0, 120), type: item.type,
    points: (Array.isArray(item.points) ? item.points : []).slice(0, 5000).filter((point) => Array.isArray(point) && point.length >= 2).map(([x,y]) => [coordinate(x),coordinate(y)]),
    color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : "#222222",
    width: Math.max(1, Math.min(40, Number(item.width) || 3)),
    visible: item.visible !== false,
    ...(item.type === "image" ? { image: item.image } : {}),
  }));
}
// A frame is illustrated by its background or visible content layers. Pins alone
// are review metadata; hidden layers should not enable an empty presentation.
export const frameHasContent = (frame) => Boolean(frame && (
  validFrameImage(frame.image) || (frame.layers || []).some((layer) =>
    layer.visible !== false && (layer.points?.length || 0) >= 2 &&
    (layer.type === "image" ? validFrameImage(layer.image) : ["path", "rectangle", "ellipse"].includes(layer.type)),
  )
));
function cleanFrameComments(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 500).filter((item) => item && typeof item.id === "string").map((item) => ({
    id: item.id.slice(0, 100), x: coordinate(item.x), y: coordinate(item.y), text: String(item.text || "").slice(0, 10000),
    replies: (Array.isArray(item.replies) ? item.replies : []).slice(0, 200).filter((reply) => reply && typeof reply.id === "string").map((reply) => ({ id: reply.id.slice(0, 100), text: String(reply.text || "").slice(0, 10000) })),
    ...(Array.isArray(item.strokes) ? { strokes: cleanFrameLayers(item.strokes) } : {}),
  }));
}
export function cleanFrames(source) {
  if (!Array.isArray(source)) return undefined;
  const used = new Set();
  return source
    .slice(0, 200)
    .filter(
      (frame) =>
        frame &&
        typeof frame.id === "string" &&
        frame.id.length <= 100 &&
        !used.has(frame.id) &&
        used.add(frame.id),
    )
    .map((frame) => ({
      id: frame.id,
      image: validFrameImage(frame.image) ? frame.image : "",
      durationMs: frameDuration(frame.durationMs),
      transition: frame.transition === "fade" ? "fade" : "cut",
      ...(Array.isArray(frame.layers) ? { layers: cleanFrameLayers(frame.layers) } : {}),
      ...(Array.isArray(frame.comments) ? { comments: cleanFrameComments(frame.comments) } : {}),
    }));
}
// Legacy shot images remain a real slide, without generating IDs on every render.
export function storyboardFrames(settings = {}) {
  return Array.isArray(settings.frames)
    ? settings.frames
    : validFrameImage(settings.image)
      ? [
          {
            id: "legacy-image",
            image: settings.image,
            durationMs: 5000,
            transition: "cut",
          },
        ]
      : [];
}
export function cleanStoryboardSettings(source) {
  const clean = {};
  const frames = cleanFrames(source.frames);
  if (frames) {
    clean.frames = frames;
    clean.image = frames.find((frame) => frame.image)?.image || "";
  }
  if (Number.isFinite(source.act))
    clean.act = Math.max(1, Math.min(99, Math.round(source.act)));
  if (Number.isFinite(source.drama))
    clean.drama = Math.max(0, Math.min(10, Math.round(source.drama)));
  if (STORY_STATUSES.some(([id]) => id === source.status))
    clean.status = source.status;
  for (const key of ["synopsis", "frameComment"])
    if (typeof source[key] === "string" && source[key].trim())
      clean[key] = source[key].slice(0, 20000);
  if (source.playbackLoop === false) clean.playbackLoop = false;
  return clean;
}

// Used by both React cards and editor decorations. Each slide owns its hold time.
export function playSlides(settings, show, connected = () => true) {
  const frames = storyboardFrames(settings).filter(frameHasContent);
  if (frames.length < 2) return () => {};
  let index = 0,
    timer,
    stopped = false;
  const tick = () => {
    if (stopped || !connected()) return;
    if (index === frames.length - 1 && settings.playbackLoop === false) return;
    index = (index + 1) % frames.length;
    show(frames[index]);
    timer = setTimeout(tick, frameDuration(frames[index].durationMs));
  };
  timer = setTimeout(tick, frameDuration(frames[0].durationMs));
  return () => {
    stopped = true;
    clearTimeout(timer);
    show(frames[0]);
  };
}
