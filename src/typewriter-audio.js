import { useEffect } from "react";

// Stable physical-key assignments, shared by Russian and English layouts.
const keys = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
  .map((key) => `Key${key}`)
  .concat(
    [..."0123456789"].map((key) => `Digit${key}`),
    [
      "Space",
      "Enter",
      "Backspace",
      "Delete",
      "Comma",
      "Period",
      "Semicolon",
      "Quote",
      "BracketLeft",
      "BracketRight",
      "Minus",
      "Equal",
    ],
  );
export function typewriterSample(event) {
  const aliases = {
    Backquote: "Equal",
    Slash: "Comma",
    Backslash: "BracketRight",
    NumpadEnter: "Enter",
    NumpadDecimal: "Period",
    NumpadDivide: "Comma",
    NumpadMultiply: "Equal",
    NumpadSubtract: "Minus",
    NumpadAdd: "Equal",
  };
  let code = /^Numpad\d$/.test(event.code || "")
    ? event.code.replace("Numpad", "Digit")
    : aliases[event.code] || event.code;
  if (!keys.includes(code)) {
    const key = event.key;
    const russian =
      key?.length === 1
        ? "фисвуапршолдьтщзйкыегмцчня".indexOf(key.toLowerCase())
        : -1;
    code =
      key === " "
        ? "Space"
        : keys.includes(key)
          ? key
          : /^[a-z]$/i.test(key || "")
            ? `Key${key.toUpperCase()}`
            : russian >= 0
              ? `Key${"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[russian]}`
              : /^\d$/.test(key || "")
                ? `Digit${key}`
                : {
                    ",": "Comma",
                    ".": "Period",
                    ";": "Semicolon",
                    "'": "Quote",
                    "[": "BracketLeft",
                    "]": "BracketRight",
                    "-": "Minus",
                    "=": "Equal",
                    ё: "Equal",
                    б: "Comma",
                    ю: "Period",
                    ж: "Semicolon",
                    э: "Quote",
                    х: "BracketLeft",
                    ъ: "BracketRight",
                    "/": "Comma",
                    "\\": "BracketRight",
                    "`": "Equal",
                    "~": "Equal",
                  }[key?.toLowerCase()];
  }
  const index = keys.indexOf(code);
  return index < 0
    ? null
    : `/audio/typewriter/${String(index + 1).padStart(3, "0")}.mp3`;
}
export function useTypewriterAudio(enabled, containerRef) {
  useEffect(() => {
    if (!enabled) return;
    let audio,
      disposed = false,
      lastKey = 0;
    let physical = null;
    const buffers = new Map(),
      sources = new Set();
    const load = (path) => {
      if (!buffers.has(path))
        buffers.set(
          path,
          fetch(path)
            .then((response) => {
              if (!response.ok) throw new Error("Audio unavailable");
              return response.arrayBuffer();
            })
            .then((bytes) => audio.decodeAudioData(bytes))
            .catch(() => null),
        );
      return buffers.get(path);
    };
    const play = async (event) => {
      if (
        !containerRef.current?.contains(event.target) ||
        !event.target.closest?.(".screenplay-editor") ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const path = typewriterSample(event);
      if (!path || performance.now() - lastKey < 25) return;
      lastKey = performance.now();
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      try {
        if (!audio) {
          audio = new Context();
          // Decode once; subsequent presses only allocate a short source node.
          for (let index = 1; index <= 48; index++)
            load(`/audio/typewriter/${String(index).padStart(3, "0")}.mp3`);
        }
        await audio.resume();
        const buffer = await load(path);
        if (disposed || !buffer) return;
        if (sources.size >= 8) {
          const oldest = sources.values().next().value;
          oldest.stop();
          sources.delete(oldest);
        }
        const source = audio.createBufferSource(),
          gain = audio.createGain();
        source.buffer = buffer;
        gain.gain.value = 0.35;
        source.connect(gain).connect(audio.destination);
        sources.add(source);
        source.onended = () => {
          sources.delete(source);
          source.disconnect();
          gain.disconnect();
        };
        source.start();
      } catch {
        /* Audio must never interrupt writing. */
      }
    };
    const input = (event) => {
      // Mobile keyboards often send beforeinput instead of a physical keydown.
      if (event.isComposing) return;
      const key =
        event.inputType === "insertParagraph"
          ? "Enter"
          : event.inputType === "deleteContentBackward"
            ? "Backspace"
            : event.data;
      const path = typewriterSample({ key });
      if (physical?.path === path) {
        physical = null;
        return;
      }
      if (key?.length === 1 || ["Enter", "Backspace"].includes(key))
        play({ target: event.target, key });
    };
    const keydown = (event) => {
      if (
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        containerRef.current?.contains(event.target) &&
        event.target.closest?.(".screenplay-editor")
      ) {
        const path = typewriterSample(event);
        if (path) physical = { path, time: performance.now() };
      }
      play(event);
    };
    document.addEventListener("keydown", keydown);
    const keyup = () => {
      physical = null;
    };
    document.addEventListener("keyup", keyup);
    document.addEventListener("beforeinput", input);
    const composed = (event) =>
      input({
        target: event.target,
        data: event.data?.at(-1),
        inputType: "insertText",
      });
    document.addEventListener("compositionend", composed);
    return () => {
      disposed = true;
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("keyup", keyup);
      document.removeEventListener("beforeinput", input);
      document.removeEventListener("compositionend", composed);
      for (const source of sources) source.stop();
      audio?.close().catch(() => {});
    };
  }, [enabled, containerRef]);
}
