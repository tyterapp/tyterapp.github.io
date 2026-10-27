import { useCallback, useEffect, useRef, useState } from "react";
import { createDictationAudio } from "./dictation-audio.js";

const recognitionClass = () =>
  globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const speechError = (code) =>
  ({
    "not-allowed":
      "Браузер не разрешил диктовку. Проверьте доступ к микрофону и разрешения сайта.",
    "service-not-allowed":
      "Браузер не разрешил диктовку. Проверьте доступ к микрофону и разрешения сайта.",
    "audio-capture":
      "Микрофон недоступен. Проверьте его подключение и настройки.",
    network:
      "Не удалось подключиться к распознаванию речи. Проверьте интернет и повторите.",
    "no-speech": "Речь не распознана. Включите микрофон и попробуйте ещё раз.",
    "language-not-supported": "Этот язык диктовки не поддерживается браузером.",
  })[code] || "Не удалось включить диктовку. Попробуйте ещё раз.";

export default function useSpeechDictation({
  enabled,
  scope,
  language,
  editorRef,
}) {
  const [status, setStatus] = useState("idle"),
    [error, setError] = useState("");
  const current = useRef(null),
    options = useRef(null);
  options.current = { enabled, scope, language, editorRef };
  const supported =
    typeof recognitionClass() === "function" &&
    globalThis.isSecureContext !== false;
  const finish = useCallback((session) => {
    if (current.current !== session) return;
    current.current = null;
    clearTimeout(session.timeout);
    session.recognition.onstart =
      session.recognition.onresult =
      session.recognition.onerror =
      session.recognition.onend =
        null;
    session.recognition.onspeechstart = session.recognition.onspeechend = null;
    session.audio.dispose();
    session.target.dispose();
    setStatus("idle");
  }, []);
  const cancel = useCallback(() => {
    const session = current.current;
    if (!session) return;
    finish(session);
    try {
      session.recognition.abort();
    } catch {
      /* Already disconnected. */
    }
  }, [finish]);
  const stop = useCallback(() => {
    const session = current.current;
    if (!session || session.stopping) return;
    session.stopping = true;
    session.listening = false;
    session.audio.dispose();
    setStatus("stopping");
    // stop() releases the mic and may deliver the final captured phrase.
    session.timeout = setTimeout(() => {
      session.complete?.();
      try {
        session.recognition.abort();
      } catch {
        /* Already stopped. */
      }
    }, 5000);
    try {
      session.recognition.stop();
    } catch {
      cancel();
    }
  }, [cancel]);
  const start = useCallback(() => {
    const config = options.current;
    if (current.current || !config.enabled) return;
    setError("");
    const Recognition = recognitionClass();
    if (
      typeof Recognition !== "function" ||
      globalThis.isSecureContext === false
    ) {
      setError("В этом браузере диктовка недоступна.");
      return;
    }
    const target = config.editorRef.current?.createDictationTarget();
    if (!target) {
      setError("Выберите место для диктовки в сценарии.");
      return;
    }
    let recognition;
    try {
      recognition = new Recognition();
    } catch {
      target.dispose();
      setError(speechError());
      return;
    }
    const session = {
      recognition,
      target,
      scope: config.scope,
      language: config.language,
      finalized: new Set(),
      stopping: false,
      pending: "",
      audio: createDictationAudio(),
      listening: false,
      speaking: false,
      activityUntil: 0,
    };
    current.current = session;
    const valid = () =>
      current.current === session &&
      options.current.enabled &&
      options.current.scope === session.scope &&
      options.current.language === session.language;
    recognition.lang = config.language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (!valid()) {
        if (current.current === session) cancel();
        return;
      }
      if (!session.stopping) {
        session.listening = true;
        session.audio.start();
        if (!target.preview("")) {
          cancel();
          setError("Позиция вставки изменилась. Включите рацию снова.");
          return;
        }
        setStatus("listening");
      }
    };
    recognition.onspeechstart = () => {
      if (valid()) session.speaking = true;
    };
    recognition.onspeechend = () => {
      session.speaking = false;
      session.activityUntil = 0;
    };
    recognition.onresult = (event) => {
      if (!valid()) {
        if (current.current === session) cancel();
        return;
      }
      for (
        let index = event.resultIndex || 0;
        index < event.results.length;
        index++
      ) {
        const result = event.results[index];
        if (!result.isFinal || session.finalized.has(index)) continue;
        session.finalized.add(index);
        if (!target.append(result[0]?.transcript)) {
          cancel();
          setError("Позиция вставки изменилась. Включите рацию снова.");
          return;
        }
      }
      session.pending = Array.from(event.results)
        .filter((result) => !result.isFinal)
        .map((result) => result[0]?.transcript || "")
        .join(" ");
      session.activityUntil = performance.now() + 650;
      if (!target.preview(session.pending)) {
        cancel();
        setError("Позиция вставки изменилась. Включите рацию снова.");
        return;
      }
    };
    recognition.onerror = (event) => {
      if (current.current !== session) return;
      if (event.error !== "aborted") setError(speechError(event.error));
      cancel();
    };
    session.complete = () => {
      if (valid() && session.pending) target.append(session.pending);
      finish(session);
    };
    recognition.onend = session.complete;
    setStatus("starting");
    // Keep this inside the user's click: the browser owns the microphone prompt.
    try {
      recognition.start();
    } catch (error) {
      cancel();
      setError(
        speechError(error.name === "NotAllowedError" ? "not-allowed" : ""),
      );
    }
  }, [cancel, finish]);
  const sample = useCallback(() => {
    const session = current.current;
    if (!session?.listening || session.stopping) return 0;
    return (
      session.audio.sample() ??
      (session.speaking || performance.now() < session.activityUntil ? 0.45 : 0)
    );
  }, []);
  useEffect(() => {
    if (!enabled) cancel();
    return cancel;
  }, [enabled, scope, language, cancel]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", cancel);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", cancel);
      cancel();
    };
  }, [cancel]);
  return {
    supported,
    enabled,
    status,
    error,
    active: status !== "idle",
    start,
    stop,
    sample,
  };
}
