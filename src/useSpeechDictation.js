import { useCallback, useEffect, useRef, useState } from "react";

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
    [interim, setInterim] = useState(""),
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
    session.target.dispose();
    setStatus("idle");
    setInterim("");
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
    setStatus("stopping");
    setInterim("");
    // stop() releases the mic and may deliver the final captured phrase.
    session.timeout = setTimeout(cancel, 5000);
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
    setInterim("");
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
      if (!session.stopping) setStatus("listening");
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
      if (!session.stopping)
        setInterim(
          Array.from(event.results)
            .filter((result) => !result.isFinal)
            .map((result) => result[0]?.transcript || "")
            .join(" ")
            .slice(-600),
        );
    };
    recognition.onerror = (event) => {
      if (current.current !== session) return;
      if (event.error !== "aborted") setError(speechError(event.error));
      cancel();
    };
    recognition.onend = () => finish(session);
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
    interim,
    error,
    active: status !== "idle",
    start,
    stop,
  };
}
