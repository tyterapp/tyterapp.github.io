import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { encodeMorse } from "./morse.js";

const alphabets = [
  ["ru", "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"],
  ["en", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
];

export default function TelegraphAlphabet({ language, onClose }) {
  const dialog = useRef(null);
  const en = language === "en";
  useEffect(() => {
    const previous = document.activeElement;
    const node = dialog.current;
    node.showModal();
    return () => {
      node.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="telegraph-alphabet"
      aria-labelledby="telegraph-alphabet-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom)
        )
          onClose();
      }}
    >
      <header className="telegraph-alphabet-heading">
        <h2 id="telegraph-alphabet-title">
          {en ? "Morse alphabet" : "Азбука Морзе"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={en ? "Close" : "Закрыть"}
          autoFocus
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="telegraph-alphabet-content">
        <p className="telegraph-alphabet-hint">
          {en
            ? "Tap for a dot, hold for a dash. Pause between letters; pause longer between words. You can also use Ctrl+M."
            : "Короткое нажатие — точка, длинное — тире. Пауза разделяет буквы, длинная пауза — слова. Можно нажимать Ctrl+M."}
        </p>
        {alphabets.map(([code, letters]) => (
          <section key={code} aria-labelledby={`telegraph-alphabet-${code}`}>
            <h3 id={`telegraph-alphabet-${code}`}>
              {code === "ru"
                ? en
                  ? "Russian"
                  : "Русский"
                : en
                  ? "English"
                  : "Английский"}
            </h3>
            <dl className="telegraph-alphabet-grid" lang={code}>
              {[...letters].map((letter) => {
                const morse = encodeMorse(letter === "Ё" ? "Е" : letter);
                return (
                  <div
                    key={letter}
                    className="telegraph-letter"
                    data-letter={letter}
                  >
                    <dt>{letter}</dt>
                    <dd>
                      <span className="visually-hidden">{morse}</span>
                      <span aria-hidden="true">
                        {morse.replaceAll(".", "·").replaceAll("-", "−")}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
            {code === "ru" && (
              <p className="telegraph-alphabet-note">
                {en
                  ? "Е and Ё share one code; the key types Е."
                  : "Е и Ё имеют один код; телеграф печатает Е."}
              </p>
            )}
          </section>
        ))}
      </div>
    </dialog>,
    document.body,
  );
}
