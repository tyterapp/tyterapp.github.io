import { useSyncExternalStore } from "react";
import english from "./locale-en.js";

const STORAGE = "tyter.language.v1";
const listeners = new Set();
const readLanguage = () => {
  try {
    return localStorage.getItem(STORAGE) === "en" ? "en" : "ru";
  } catch {
    return "ru";
  }
};
let language = readLanguage();
export const getLanguage = () => language;
export const languageLocale = () => (language === "en" ? "en-US" : "ru-RU");
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const useLanguage = () =>
  useSyncExternalStore(subscribe, getLanguage, () => "ru");
const notify = () => {
  document.documentElement.lang = language;
  listeners.forEach((listener) => listener());
};
export function setLanguage(next) {
  if (!["ru", "en"].includes(next) || next === language) return;
  language = next;
  try {
    localStorage.setItem(STORAGE, next);
  } catch {
    /* This tab still remembers the choice. */
  }
  notify();
}
if (typeof window !== "undefined") {
  document.documentElement.lang = language;
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE) return;
    const next = readLanguage();
    if (next !== language) {
      language = next;
      notify();
    }
  });
}
export function t(message, ...values) {
  if (typeof message !== "string") return message;
  const key = message.replace(/\s+/g, " ").trim();
  let text =
    language === "en" && english[key]
      ? (message.match(/^\s*/)?.[0] || "") +
        english[key] +
        (message.match(/\s*$/)?.[0] || "")
      : message;
  return text.replace(/\{(\d+)\}/g, (token, index) =>
    Number(index) < values.length ? String(values[index] ?? "") : token,
  );
}
