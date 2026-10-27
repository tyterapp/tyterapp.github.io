import { useCallback, useEffect, useRef, useState } from "react";
import { readWritingTimer } from "../../writing-timer.js";
import { dailyQuestLibrary, questDay } from "./library.js";
import {
  PRO_QUEST_STORAGE,
  dailyProgress,
  readQuestScopes,
  advanceWords,
  finishQuest,
  unlockedCards,
  questStatus,
} from "./progress.js";

export function useDailyQuests(enabled, scope, timer) {
  const [state, setState] = useState(() => ({
    scope,
    record: dailyProgress(scope, Date.now(), enabled ? readQuestScopes() : {}),
  }));
  const selected = useRef(scope);
  selected.current = scope;
  const refresh = useCallback(() => {
    if (enabled) setState({ scope, record: dailyProgress(scope) });
  }, [enabled, scope]);
  useEffect(() => {
    refresh();
    if (!enabled) return;
    const sync = (event) => {
      if (!event || event.key === PRO_QUEST_STORAGE || event.key === null)
        refresh();
    };
    const interval = setInterval(refresh, 15_000);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, refresh]);
  const mutate = useCallback(
    async (action) => {
      if (!enabled) return { ok: false, reason: "pro" };
      const perform = async () => {
        const scopes = readQuestScopes(),
          current = dailyProgress(scope, Date.now(), scopes);
        const result = await action(current);
        if (!result?.record) return result;
        try {
          localStorage.setItem(
            PRO_QUEST_STORAGE,
            JSON.stringify({ scopes: { ...scopes, [scope]: result.record } }),
          );
        } catch {
          return { ok: false, reason: "storage" };
        }
        if (selected.current === scope)
          setState({ scope, record: result.record });
        return result;
      };
      return navigator.locks?.request
        ? navigator.locks.request(PRO_QUEST_STORAGE, perform)
        : perform();
    },
    [enabled, scope],
  );
  const recordWords = useCallback(
    (delta) => {
      if (!enabled || !delta) return;
      mutate((current) => ({
        ok: true,
        record: advanceWords(current, delta, readWritingTimer().session, scope),
      })).catch(() => {});
    },
    [enabled, mutate, scope],
  );
  const begin = async (cardId, minutes) =>
    mutate(async (current) => {
      const cards = dailyQuestLibrary(scope, current.day);
      const idea = readWritingTimer().ideas?.find(
        (idea) =>
          idea.id === cardId &&
          idea.scope === scope &&
          idea.day === current.day,
      );
      const index = cards.findIndex((card) => card.id === cardId);
      if (!idea && (index < 0 || index >= unlockedCards(current, cards.length)))
        return { ok: false, reason: "locked" };
      if (current.completed.includes(cardId))
        return { ok: false, reason: "completed" };
      const session = readWritingTimer().session;
      if (current.active && questStatus(current, session) !== "expired")
        return { ok: false, reason: "active" };
      const link = { scope, day: current.day };
      const started =
        session &&
        (session.status === "paused" || session.deadline > Date.now())
          ? await timer.linkQuest(link)
          : await timer.start(minutes, link);
      if (!started.ok || !started.session)
        return { ok: false, reason: started.reason || "busy" };
      const run =
        current.run?.timerId === started.session.id
          ? current.run
          : { timerId: started.session.id, netWords: 0, highWater: 0 };
      return {
        ok: true,
        record: {
          ...current,
          run,
          active: {
            cardId,
            timerId: started.session.id,
            baseline: run.netWords,
            startedAt: Date.now(),
          },
        },
      };
    });
  const finish = (card) =>
    mutate((current) => finishQuest(current, readWritingTimer().session, card));
  const cancel = () =>
    mutate((current) => ({ ok: true, record: { ...current, active: null } }));
  // A version switch renders immediately; don't briefly show the preceding zone.
  const day = questDay();
  const current =
    state.record.day === day && state.scope === scope
      ? state.record
      : dailyProgress(scope);
  return { record: current, recordWords, begin, finish, cancel };
}
