import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useLanguage } from "./i18n.js";

export default function WritingHouse({ closing, onClose }) {
  const language = useLanguage();
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <aside
      id="writing-house"
      className={`writing-house${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-label={language === "en" ? "oiia house" : "oiia домик"}
    >
      <header className="writing-shop-header">
        <strong>{language === "en" ? "oiia house" : "oiia домик"}</strong>
        <button
          ref={closeRef}
          type="button"
          className="writing-timer-button"
          onClick={onClose}
          aria-label={language === "en" ? "Close house" : "Закрыть домик"}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <img
        src="/oiia/house.png"
        alt={
          language === "en"
            ? "An empty room ready for your future pet"
            : "Пустая комната для будущего питомца"
        }
        width="734"
        height="468"
      />
    </aside>
  );
}
