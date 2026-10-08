import { useEffect, useState } from "react";

const STORAGE = "tyter.editor-preferences.v1";
const defaults = { theme: "light", typewriter: false };
export function readEditorPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    return {
      theme: saved?.theme === "dark" ? "dark" : "light",
      typewriter: saved?.typewriter === true,
    };
  } catch {
    return { ...defaults };
  }
}
export function useEditorPreferences() {
  const [preferences, setPreferences] = useState(readEditorPreferences);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(preferences));
    } catch {
      /* Keep preferences for this tab when storage is unavailable. */
    }
  }, [preferences]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === STORAGE) setPreferences(readEditorPreferences());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return [
    preferences,
    (patch) => setPreferences((value) => ({ ...value, ...patch })),
  ];
}

export function useTypewriterSound(enabled, containerRef) {
  useEffect(() => {
    if (!enabled) return;
    let audio;
    let previous = 0;
    const play = (event) => {
      if (
        !containerRef.current?.contains(event.target) ||
        !event.target.closest?.(".screenplay-editor") ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing ||
        (event.type !== "compositionend" &&
          event.key.length !== 1 &&
          !["Enter", "Backspace", "Delete"].includes(event.key))
      )
        return;
      if (performance.now() - previous < 30) return;
      previous = performance.now();
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      try {
        audio ||= new Audio();
        audio.resume().catch(() => {});
        const buffer = audio.createBuffer(
          1,
          Math.ceil(audio.sampleRate * 0.04),
          audio.sampleRate,
        );
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++)
          samples[i] =
            (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * 0.006));
        const noise = audio.createBufferSource(),
          filter = audio.createBiquadFilter(),
          gain = audio.createGain();
        noise.buffer = buffer;
        filter.type = "bandpass";
        filter.frequency.value = event.key === "Enter" ? 900 : 1800;
        gain.gain.value = 0.12;
        noise.connect(filter).connect(gain).connect(audio.destination);
        noise.start();
        noise.onended = () => {
          noise.disconnect();
          filter.disconnect();
          gain.disconnect();
        };
      } catch {
        /* An unsupported or blocked audio device must never interrupt typing. */
      }
    };
    document.addEventListener("keydown", play);
    document.addEventListener("compositionend", play);
    return () => {
      document.removeEventListener("keydown", play);
      document.removeEventListener("compositionend", play);
      audio?.close().catch(() => {});
    };
  }, [enabled, containerRef]);
}
