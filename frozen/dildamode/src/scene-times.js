// Shared by autocomplete, the doctor and automatic shot metadata.
export const SCENE_TIMES = [
  ["day", "ДЕНЬ", "DAY"],
  ["night", "НОЧЬ", "NIGHT"],
  ["evening", "ВЕЧЕР", "EVENING"],
  ["morning", "УТРО", "MORNING"],
  ["dusk", "СУМЕРКИ", "DUSK"],
  ["dawn", "РАССВЕТ", "DAWN"],
  ["sunrise", "ВОСХОД", "SUNRISE"],
  ["sunset", "ЗАКАТ", "SUNSET"],
  ["noon", "ПОЛДЕНЬ", "NOON"],
  ["midnight", "ПОЛНОЧЬ", "MIDNIGHT"],
  ["later", "ПОЗЖЕ", "LATER"],
  ["continuous", "ПРОДОЛЖЕНИЕ", "CONTINUOUS"],
];
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const SCENE_TIME_ENDING = new RegExp(
  `(?:[—–-]\\s*|\\s)(${SCENE_TIMES.flatMap(([, ru, en]) => [ru, en])
    .map(escape)
    .join("|")})\\s*[.]*$`,
  "iu",
);
export function sceneTimeOfDay(heading) {
  const word = String(heading || "")
    .match(SCENE_TIME_ENDING)?.[1]
    ?.toUpperCase();
  return (
    SCENE_TIMES.find(([, ru, en]) => word === ru || word === en)?.[0] || ""
  );
}
