import { useCallback, useEffect, useRef, useState } from "react";
import { cleanStreak, dailyVisit } from "./daily-streak.js";

export const WRITING_TIMER_STORAGE = "tyter.writing-timer.v1";
export const TIMER_MINUTES = [5, 10, 25, 60, 120, 240];
const emptyTimer = () => ({ coins: 0, session: null });

function cleanTimer(value) {
  const coins =
    Number.isSafeInteger(value?.coins) && value.coins >= 0 ? value.coins : 0;
  const session = value?.session;
  const ideas = Array.isArray(value?.ideas)
    ? value.ideas
        .filter(
          (idea) =>
            typeof idea?.id === "string" &&
            typeof idea.scope === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(idea.day) &&
            typeof idea.text === "string" &&
            idea.text.length <= 4000,
        )
        .slice(-200)
    : [];
  const streak = cleanStreak(value?.streak);
  const wallet = {
    coins,
    ...(ideas.length ? { ideas } : {}),
    ...(streak ? { streak } : {}),
  };
  const quest = session?.quest;
  const link =
    typeof quest?.scope === "string" &&
    quest.scope.length <= 256 &&
    /^\d{4}-\d{2}-\d{2}$/.test(quest.day)
      ? { quest: { scope: quest.scope, day: quest.day } }
      : {};
  const duration = session?.minutes * 60_000;
  if (
    !session ||
    typeof session.id !== "string" ||
    !TIMER_MINUTES.includes(session.minutes) ||
    !["running", "paused"].includes(session.status) ||
    (session.status === "running" && !Number.isFinite(session.deadline)) ||
    (session.status === "paused" &&
      (!Number.isFinite(session.remainingMs) ||
        session.remainingMs <= 0 ||
        session.remainingMs > duration))
  )
    return { ...wallet, session: null };
  return {
    ...wallet,
    session:
      session.status === "running"
        ? {
            id: session.id,
            minutes: session.minutes,
            status: "running",
            deadline: session.deadline,
            ...link,
          }
        : {
            id: session.id,
            minutes: session.minutes,
            status: "paused",
            remainingMs: session.remainingMs,
            ...link,
          },
  };
}

export function readWritingTimer(fallback = emptyTimer()) {
  let saved;
  try {
    saved = localStorage.getItem(WRITING_TIMER_STORAGE);
  } catch {
    return fallback;
  }
  try {
    return saved ? cleanTimer(JSON.parse(saved)) : emptyTimer();
  } catch {
    return emptyTimer();
  }
}

export function timerRemaining(session, now) {
  return !session
    ? 0
    : session.status === "paused"
      ? session.remainingMs
      : Math.max(0, session.deadline - now);
}

export function formatTimerTime(remainingMs) {
  const seconds = Math.ceil(remainingMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function useWritingTimer(onComplete) {
  const [state, setState] = useState(readWritingTimer);
  const [now, setNow] = useState(Date.now);
  const latest = useRef(state);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const memoryOnly = useRef(false);

  const change = useCallback(
    (action = "refresh", minutes, sessionId, payload) => {
      const perform = () => {
        const current = memoryOnly.current
          ? latest.current
          : readWritingTimer(latest.current);
        const time = Date.now();
        let next = current;
        let reward = 0;
        let result = { ok: true };
        let visitReward = 0;
        // Read the stored session inside the lock, then remove it before notifying.
        // Two tabs (or a reload after completion) must never claim it twice.
        if (
          current.session?.status === "running" &&
          current.session.deadline <= time
        ) {
          reward = current.session.minutes;
          next = { ...current, coins: current.coins + reward, session: null };
        }
        if (
          action === "start" &&
          !next.session &&
          TIMER_MINUTES.includes(minutes)
        ) {
          next = {
            ...next,
            session: {
              id:
                globalThis.crypto?.randomUUID?.() || `${time}-${Math.random()}`,
              minutes,
              status: "running",
              deadline: time + minutes * 60_000,
              ...(payload ? { quest: payload } : {}),
            },
          };
        } else if (next.session && next.session.id === sessionId) {
          if (action === "stop") next = { ...next, session: null };
          else if (action === "toggle") {
            const session = next.session;
            next = {
              ...next,
              session:
                session.status === "running"
                  ? {
                      id: session.id,
                      minutes: session.minutes,
                      status: "paused",
                      remainingMs: timerRemaining(session, time),
                      ...(session.quest ? { quest: session.quest } : {}),
                    }
                  : {
                      id: session.id,
                      minutes: session.minutes,
                      status: "running",
                      deadline: time + session.remainingMs,
                      ...(session.quest ? { quest: session.quest } : {}),
                    },
            };
          } else if (action === "link") {
            if (
              next.session.quest &&
              next.session.quest.scope !== payload.scope
            )
              result = { ok: false, reason: "busy" };
            else
              next = { ...next, session: { ...next.session, quest: payload } };
          }
        }
        if (action === "start" && next === current)
          result = { ok: false, reason: "busy" };
        if (action === "link" && !next.session)
          result = { ok: false, reason: "expired" };
        if (
          action === "link" &&
          next.session &&
          next.session.quest?.scope !== payload.scope
        )
          result = { ok: false, reason: "busy" };
        if (action === "idea") {
          const existing = next.ideas?.find((idea) => idea.id === payload.id);
          if (existing) result = { ok: true, idea: existing };
          else if (next.coins < 5) result = { ok: false, reason: "coins" };
          else {
            const idea = { ...payload, cost: 5 };
            next = {
              ...next,
              coins: next.coins - 5,
              ideas: [...(next.ideas || []), idea].slice(-200),
            };
            result = { ok: true, idea };
          }
        }
        if (action === "visit") {
          const visit = dailyVisit(next, time);
          next = visit.wallet;
          visitReward = visit.reward;
        }
        if (next !== current) {
          try {
            localStorage.setItem(WRITING_TIMER_STORAGE, JSON.stringify(next));
            memoryOnly.current = false;
          } catch {
            if (action === "idea") return { ok: false, reason: "storage" };
            // A blocked or full storage must not interrupt editing or the countdown.
            memoryOnly.current = true;
          }
        }
        latest.current = next;
        setState(next);
        setNow(time);
        if (reward)
          complete.current?.({
            key: "Таймер завершён. Начислено монет: {0}.",
            values: [reward],
          });
        if (visitReward)
          complete.current?.({
            key:
              visitReward > 1
                ? "Стрик: {0} дней. Начислено монет: {1}."
                : "С возвращением! Монета за вход сегодня: +1.",
            values: visitReward > 1 ? [next.streak.count, visitReward] : [],
          });
        return { ...result, session: next.session };
      };
      if (navigator.locks?.request)
        return navigator.locks.request(WRITING_TIMER_STORAGE, perform);
      return Promise.resolve(perform());
    },
    [],
  );

  useEffect(() => {
    change();
    const sync = (event) => {
      if (
        event.type !== "storage" ||
        event.key === WRITING_TIMER_STORAGE ||
        event.key === null
      ) {
        if (event.type === "storage") memoryOnly.current = false;
        change();
      }
    };
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [change]);

  useEffect(() => {
    if (state.session?.status !== "running") return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (
        latest.current.session?.status === "running" &&
        latest.current.session.deadline <= time
      )
        change();
    };
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [
    change,
    state.session?.status,
    state.session?.id,
    state.session?.deadline,
  ]);

  const claimVisit = useCallback(() => change("visit"), [change]);
  return {
    now,
    coins: state.coins,
    streak: state.streak || null,
    claimVisit,
    ideas: state.ideas || [],
    session: state.session,
    remainingMs: timerRemaining(state.session, now),
    start: (minutes, quest) => change("start", minutes, null, quest),
    linkQuest: (quest) => change("link", null, state.session?.id, quest),
    buyIdea: (idea) => change("idea", null, null, idea),
    toggle: () => change("toggle", null, state.session?.id),
    stop: () => change("stop", null, state.session?.id),
  };
}
