import { useEffect, useState } from "react";

const STORAGE = "tyter.editor-preferences.v1";
const defaults = { theme: "light", typewriter: false, doctorFlies: true };
export function readEditorPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    return {
      theme: saved?.theme === "dark" ? "dark" : "light",
      typewriter: saved?.typewriter === true,
      doctorFlies: saved?.doctorFlies !== false,
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

export { useTypewriterAudio as useTypewriterSound } from "./typewriter-audio.js";
