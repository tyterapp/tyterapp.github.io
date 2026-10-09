import { useCallback, useEffect, useRef, useState } from "react";

export const WRITING_TIMER_STORAGE = "tyter.writing-timer.v1";
export const TIMER_MINUTES = [5, 10, 25, 60, 120, 240];
const emptyTimer = () => ({ coins: 0, session: null });

function cleanTimer(value) {
  const coins =
    Number.isSafeInteger(value?.coins) && value.coins >= 0 ? value.coins : 0;
  const session = value?.session;
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
    return { coins, session: null };
  return {
    coins,
    session:
      session.status === "running"
        ? {
            id: session.id,
            minutes: session.minutes,
            status: "running",
            deadline: session.deadline,
          }
        : {
            id: session.id,
            minutes: session.minutes,
            status: "paused",
            remainingMs: session.remainingMs,
          },
  };
}

function readTimer(fallback = emptyTimer()) {
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
  const [state, setState] = useState(readTimer);
  const [now, setNow] = useState(Date.now);
  const latest = useRef(state);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const memoryOnly = useRef(false);

  const change = useCallback((action = "refresh", minutes, sessionId) => {
    const perform = () => {
      const current = memoryOnly.current
        ? latest.current
        : readTimer(latest.current);
      const time = Date.now();
      let next = current;
      let reward = 0;
      // Read the stored session inside the lock, then remove it before notifying.
      // Two tabs (or a reload after completion) must never claim it twice.
      if (
        current.session?.status === "running" &&
        current.session.deadline <= time
      ) {
        reward = current.session.minutes;
        next = { coins: current.coins + reward, session: null };
      }
      if (
        action === "start" &&
        !next.session &&
        TIMER_MINUTES.includes(minutes)
      ) {
        next = {
          ...next,
          session: {
            id: globalThis.crypto?.randomUUID?.() || `${time}-${Math.random()}`,
            minutes,
            status: "running",
            deadline: time + minutes * 60_000,
          },
        };
      } else if (next.session?.id === sessionId) {
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
                  }
                : {
                    id: session.id,
                    minutes: session.minutes,
                    status: "running",
                    deadline: time + session.remainingMs,
                  },
          };
        }
      }
      if (next !== current) {
        try {
          localStorage.setItem(WRITING_TIMER_STORAGE, JSON.stringify(next));
          memoryOnly.current = false;
        } catch {
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
    };
    if (navigator.locks?.request)
      return navigator.locks.request(WRITING_TIMER_STORAGE, perform);
    perform();
    return Promise.resolve();
  }, []);

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

  return {
    coins: state.coins,
    session: state.session,
    remainingMs: timerRemaining(state.session, now),
    start: (minutes) => change("start", minutes),
    toggle: () => change("toggle", null, state.session?.id),
    stop: () => change("stop", null, state.session?.id),
  };
}
