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
function cleanFrameLayers(value) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 500).filter((item) => item && typeof item.id === "string" && ["path", "rectangle", "ellipse"].includes(item.type)).map((item) => ({
    id: item.id.slice(0, 100), name: String(item.name || "Layer").slice(0, 120), type: item.type,
    points: (Array.isArray(item.points) ? item.points : []).slice(0, 5000).filter((point) => Array.isArray(point) && point.length >= 2).map(([x,y]) => [coordinate(x),coordinate(y)]),
    color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : "#222222",
    width: Math.max(1, Math.min(40, Number(item.width) || 3)),
    visible: item.visible !== false,
  }));
}
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
  const frames = storyboardFrames(settings).filter((frame) => frame.image);
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
