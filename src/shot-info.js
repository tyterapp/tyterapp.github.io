import { SCENE_VARIANTS, sceneLetter } from "./scene-variants.js";
import { screenplayLayout, screenplayBlockLayout } from "./document-layout.js";
import { SCENE_TIMES, sceneTimeOfDay } from "./scene-times.js";

const field = (key, ru, en, example, options) => ({
  key,
  label: [ru, en],
  example,
  options,
});
export const SHOT_FIELDS = [
  field(
    "aspectRatio",
    "Формат кадра",
    "Aspect ratio",
    ["2.39 — широкий киноэкран", "2.39 — widescreen"],
    [
      "9:16",
      "1:1",
      "1.20",
      "1.33",
      "1.37",
      "1.43",
      "1.66",
      "1.78",
      "1.85",
      "1.90",
      "2.00",
      "2.20",
      "2.35",
      "2.39",
      "2.55",
      "2.67",
      "2.76+",
    ].map((v) => [v, v, v]),
  ),
  field(
    "opticalFormat",
    "Оптический формат",
    "Optical format",
    ["Анаморфный — овальное боке", "Anamorphic — oval bokeh"],
    [
      ["anamorphic", "Анаморфный", "Anamorphic"],
      ["spherical", "Сферический", "Spherical"],
      ["super35", "Super 35", "Super 35"],
      ["3perf", "3 perf", "3 perf"],
      ["2perf", "2 perf", "2 perf"],
      ["openGate", "Open Gate", "Open Gate"],
      ["3d", "3D", "3D"],
    ],
  ),
  field(
    "frameSize",
    "Крупность плана",
    "Frame size",
    ["Крупный — лицо героя", "Close up — the character’s face"],
    [
      ["extremeWide", "Дальний", "Extreme wide"],
      ["wide", "Общий", "Wide"],
      ["mediumWide", "Средне-общий", "Medium wide"],
      ["medium", "Средний", "Medium"],
      ["mediumClose", "Средне-крупный", "Medium close up"],
      ["close", "Крупный", "Close up"],
      ["extremeClose", "Деталь", "Extreme close up"],
    ],
  ),
  field(
    "format",
    "Формат съёмки",
    "Capture format",
    ["Плёнка 35 мм", "35 mm film"],
    [
      ["film35", "Плёнка — 35 мм", "Film — 35 mm"],
      ["film16", "Плёнка — 16 мм", "Film — 16 mm"],
      ["super8", "Плёнка — Super 8 мм", "Film — Super 8 mm"],
      ["film70", "Плёнка — 65 / 70 мм", "Film — 65 / 70 mm"],
      ["imax", "Плёнка — IMAX", "Film — IMAX"],
      ["tape", "Видеолента", "Tape"],
      ["digital", "Цифровой", "Digital"],
      ["digitalLarge", "Цифровой — большой формат", "Digital — large format"],
      ["animation", "Анимация", "Animation"],
    ],
  ),
  field(
    "shotType",
    "Тип кадра",
    "Shot type",
    [
      "Через плечо — разговор двух героев",
      "Over the shoulder — a conversation",
    ],
    [
      ["aerial", "С воздуха", "Aerial"],
      ["overhead", "Сверху", "Overhead"],
      ["high", "Высокий ракурс", "High angle"],
      ["low", "Низкий ракурс", "Low angle"],
      ["dutch", "Голландский угол", "Dutch angle"],
      ["establishing", "Установочный", "Establishing shot"],
      ["shoulder", "Через плечо", "Over the shoulder"],
      ["single", "Один герой", "Clean single"],
      ["two", "Два героя", "2 shot"],
      ["three", "Три героя", "3 shot"],
      ["group", "Группа", "Group shot"],
      ["insert", "Вставка / деталь", "Insert"],
    ],
  ),
  field(
    "timeOfDay",
    "Время суток",
    "Time of day",
    ["НОЧЬ в заголовке → ночь", "NIGHT in the heading → night"],
    SCENE_TIMES,
  ),
  field(
    "people",
    "Людей в кадре",
    "Number of people",
    ["2 — два героя в кадре", "2 — two characters in frame"],
    [
      ["0", "Никого", "None"],
      ...[1, 2, 3, 4, 5].map((v) => [String(v), String(v), String(v)]),
      ["6+", "6+", "6+"],
    ],
  ),
  field(
    "composition",
    "Композиция",
    "Composition",
    [
      "Симметрия — герой по центру",
      "Symmetrical — the character in the centre",
    ],
    [
      ["center", "По центру", "Center"],
      ["left", "Акцент слева", "Left heavy"],
      ["right", "Акцент справа", "Right heavy"],
      ["balanced", "Сбалансированная", "Balanced"],
      ["symmetrical", "Симметричная", "Symmetrical"],
      ["shortSide", "Короткая сторона", "Short side"],
    ],
  ),
  field(
    "lens",
    "Объектив",
    "Lens size",
    ["Широкоугольный — просторное помещение", "Wide — a spacious room"],
    [
      ["ultraWide", "Сверхширокий / рыбий глаз", "Ultra wide / fisheye"],
      ["wide", "Широкоугольный", "Wide"],
      ["medium", "Нормальный", "Medium"],
      ["long", "Длиннофокусный", "Long lens"],
      ["telephoto", "Телеобъектив", "Telephoto"],
    ],
  ),
  field(
    "lighting",
    "Характер света",
    "Lighting",
    [
      "Контровой — силуэт на фоне окна",
      "Backlight — a silhouette against a window",
    ],
    [
      ["soft", "Мягкий", "Soft light"],
      ["hard", "Жёсткий", "Hard light"],
      ["highContrast", "Высокий контраст", "High contrast"],
      ["lowContrast", "Низкий контраст", "Low contrast"],
      ["silhouette", "Силуэт", "Silhouette"],
      ["top", "Верхний", "Top light"],
      ["under", "Нижний", "Underlight"],
      ["side", "Боковой", "Side light"],
      ["back", "Контровой", "Backlight"],
      ["edge", "Контурный", "Edge light"],
    ],
  ),
  field(
    "lightingType",
    "Источник света",
    "Lighting type",
    ["Практический — лампа внутри кадра", "Practical — a lamp in the frame"],
    [
      ["daylight", "Дневной", "Daylight"],
      ["sunny", "Солнечный", "Sunny"],
      ["overcast", "Пасмурный", "Overcast"],
      ["moonlight", "Лунный", "Moonlight"],
      ["artificial", "Искусственный", "Artificial light"],
      ["practical", "Практический", "Practical light"],
      ["fluorescent", "Флуоресцентный", "Fluorescent"],
      ["firelight", "Огонь", "Firelight"],
      ["mixed", "Смешанный", "Mixed light"],
    ],
  ),
];

export const shotText = (node) =>
  (node.content || [])
    .map((part) => part.text || (part.type === "hardBreak" ? "\n" : ""))
    .join("");
export const shotSettings = (document, id, letter) =>
  document.sceneShots?.[id]?.[letter] || {};
export const hasShotSettings = (settings) =>
  Object.keys(settings || {}).some((key) => key !== "reference");
export const FORMAT_NAMES = {
  scene: ["Заголовок", "Scene heading"],
  action: ["Действие", "Action"],
  character: ["Персонаж", "Character"],
  speech: ["Диалог", "Dialogue"],
  parenthetical: ["Ремарка", "Parenthetical"],
  transition: ["Переход", "Transition"],
  plain: ["Заметки", "Notes"],
};
export function cleanShootingDate(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match.map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return "";
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1] ? value : "";
}
export function cleanShotLocation(value) {
  if (!value || typeof value !== "object") return null;
  const { latitude, longitude } = value;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    return null;
  const location = {
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
  };
  if (typeof value.name === "string" && value.name.trim())
    location.name = value.name.slice(0, 180);
  return location;
}
export function shotLocationLabel(location) {
  const clean = cleanShotLocation(location);
  if (!clean) return "";
  return `${clean.name ? `${clean.name.trim()} · ` : ""}${clean.latitude.toFixed(6)}, ${clean.longitude.toFixed(6)}`;
}
export function cleanShotSettings(source) {
  const clean = {};
  if (!source || typeof source !== "object") return clean;
  if (typeof source.name === "string" && source.name.trim())
    clean.name = source.name.slice(0, 180);
  const shootingDate = cleanShootingDate(source.shootingDate);
  if (shootingDate) clean.shootingDate = shootingDate;
  const location = cleanShotLocation(source.location);
  if (location) clean.location = location;
  for (const { key, options } of SHOT_FIELDS)
    if (options.some(([value]) => value === source[key]))
      clean[key] = source[key];
  for (const key of ["excludeNudity", "excludeViolence"])
    if (source[key] === false) clean[key] = false;
  if (
    typeof source.image === "string" &&
    source.image.length < 2 * 1024 * 1024 &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(source.image)
  )
    clean.image = source.image;
  return clean;
}
export function cleanSceneShots(source, content) {
  const clean = {};
  for (const node of content || []) {
    if (node.attrs?.format !== "scene") continue;
    const id = node.attrs.blockId,
      versions = {};
    for (const letter of SCENE_VARIANTS) {
      const settings = cleanShotSettings(source?.[id]?.[letter]);
      if (hasShotSettings(settings)) versions[letter] = settings;
    }
    if (Object.keys(versions).length) clean[id] = versions;
  }
  return clean;
}
export function updateShotSettings(document, id, letter, patch) {
  const value = cleanShotSettings(
    patch === null ? {} : { ...shotSettings(document, id, letter), ...patch },
  );
  const versions = { ...(document.sceneShots?.[id] || {}) };
  if (hasShotSettings(value)) versions[letter] = value;
  else delete versions[letter];
  const sceneShots = { ...document.sceneShots };
  if (Object.keys(versions).length) sceneShots[id] = versions;
  else delete sceneShots[id];
  return { ...document, sceneShots };
}

function wrappedLineCount(text, columns) {
  // Courier is monospaced; use the full export width, independent of screen and zoom.
  return String(text || " ")
    .split("\n")
    .reduce((total, line) => {
      let length = 0,
        count = 1;
      for (const word of line.match(/\S+\s*|\s+/gu) || []) {
        const size = [...word].length;
        if (length && length + size > columns) {
          count++;
          length = 0;
        }
        count += Math.max(0, Math.ceil(size / columns) - 1);
        length = size > columns ? ((size - 1) % columns) + 1 : length + size;
      }
      return total + count;
    }, 0);
}
export function sceneDuration(nodes, fontSize = 12) {
  const layout = screenplayLayout(fontSize);
  const usableHeight = (layout.height - layout.top - layout.bottom) * 0.75;
  const textWidth = (layout.width - layout.left - layout.right) * 0.75;
  let height = 0,
    previousAfter = 0;
  nodes.forEach((node, index) => {
    const geometry = screenplayBlockLayout(
      node.attrs?.format,
      nodes[index + 1]?.attrs?.format,
    );
    const columns = Math.max(
      1,
      Math.floor((textWidth * geometry.width) / (layout.fontSize * 0.6)),
    );
    height +=
      (index ? Math.max(previousAfter, geometry.before) * 0.75 : 0) +
      wrappedLineCount(shotText(node), columns) *
        layout.fontSize *
        layout.lineHeight;
    previousAfter = geometry.after;
  });
  return {
    pages: height / usableHeight,
    seconds: Math.round((height / usableHeight) * 60),
  };
}
export const durationLabel = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
export function shotScenes(document, { allVariants = false } = {}) {
  const nodes = document.content?.content || [],
    scenes = [];
  let number = 0;
  for (let start = 0; start < nodes.length; start++) {
    if (nodes[start].attrs?.format !== "scene") continue;
    let end = start + 1;
    while (end < nodes.length && nodes[end].attrs?.format !== "scene") end++;
    const heading = nodes[start],
      id = heading.attrs.blockId,
      current = sceneLetter(heading);
    number++;
    const letters = allVariants
      ? SCENE_VARIANTS.filter(
          (letter) =>
            letter === current || document.sceneVariants?.[id]?.[letter],
        )
      : [current];
    for (const letter of letters) {
      const blocks =
        letter === current
          ? nodes.slice(start, end)
          : document.sceneVariants[id][letter];
      const title = shotText(blocks[0]);
      scenes.push({
        id,
        number,
        letter,
        title,
        blocks,
        settings: shotSettings(document, id, letter),
        timeOfDay: sceneTimeOfDay(title),
        ...sceneDuration(blocks, document.metadata?.fontSize),
      });
    }
    start = end - 1;
  }
  return scenes;
}
