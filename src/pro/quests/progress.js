import { questDay, WORDS_PER_CARD } from "./library.js";

export const PRO_QUEST_STORAGE = "tyter.pro.quests.v1";
const empty = (day) => ({
  day,
  words: 0,
  completed: [],
  active: null,
  run: null,
});
export function readQuestScopes() {
  try {
    const scopes = JSON.parse(localStorage.getItem(PRO_QUEST_STORAGE))?.scopes;
    return scopes && typeof scopes === "object" && !Array.isArray(scopes)
      ? scopes
      : {};
  } catch {
    return {};
  }
}
export function dailyProgress(
  scope,
  now = Date.now(),
  scopes = readQuestScopes(),
) {
  const day = questDay(now),
    record = scopes[scope];
  if (record?.day !== day) return empty(day);
  const run = record.run;
  const active = record.active;
  const safeRun =
    typeof run?.timerId === "string" &&
    Number.isSafeInteger(run.netWords) &&
    run.netWords >= 0 &&
    Number.isSafeInteger(run.highWater) &&
    run.highWater >= run.netWords
      ? run
      : null;
  const safeActive =
    typeof active?.cardId === "string" &&
    typeof active.timerId === "string" &&
    Number.isSafeInteger(active.baseline) &&
    active.baseline >= 0
      ? active
      : null;
  return {
    ...empty(day),
    words:
      Number.isSafeInteger(record.words) && record.words >= 0
        ? record.words
        : 0,
    completed: Array.isArray(record.completed)
      ? [
          ...new Set(record.completed.filter((id) => typeof id === "string")),
        ].slice(-200)
      : [],
    active: safeActive,
    run: safeRun,
  };
}
export const unlockedCards = (record, count) =>
  Math.min(count, 1 + Math.floor(record.words / WORDS_PER_CARD));
export function advanceWords(record, delta, session, scope, now = Date.now()) {
  if (
    !Number.isFinite(delta) ||
    !delta ||
    session?.status !== "running" ||
    session.deadline <= now ||
    session.quest?.scope !== scope ||
    session.quest?.day !== record.day ||
    record.day !== questDay(now)
  )
    return record;
  const previous =
    record.run?.timerId === session.id
      ? record.run
      : { timerId: session.id, netWords: 0, highWater: 0 };
  const netWords = Math.max(0, previous.netWords + delta);
  const highWater = Math.max(previous.highWater, netWords);
  return {
    ...record,
    words: record.words + highWater - previous.highWater,
    run: { ...previous, netWords, highWater },
  };
}
export function questStatus(record, session, now = Date.now()) {
  const active = record.active;
  if (!active) return "idle";
  if (
    record.day !== questDay(now) ||
    session?.id !== active.timerId ||
    (session.status === "running" && session.deadline <= now)
  )
    return "expired";
  return session.status;
}
export const questWords = (record) =>
  Math.max(0, (record.run?.netWords || 0) - (record.active?.baseline || 0));
export function finishQuest(record, session, card, now = Date.now()) {
  if (questStatus(record, session, now) !== "running")
    return { ok: false, reason: "expired" };
  if (record.active.cardId !== card?.id || questWords(record) < card.goal)
    return { ok: false, reason: "words" };
  if (record.completed.includes(card.id))
    return { ok: false, reason: "completed" };
  return {
    ok: true,
    record: {
      ...record,
      active: null,
      completed: [...record.completed, card.id],
    },
  };
}
