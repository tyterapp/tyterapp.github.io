import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { t, useLanguage } from "./i18n.js";

export default function WritingHouse({ closing, onClose }) {
  const language = useLanguage();
  const closeRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const sizeLabel = t(
    expanded ? "Уменьшить домик до 100%" : "Увеличить домик до 200%",
  );
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <aside
      id="writing-house"
      className={`writing-house${expanded ? " is-expanded" : ""}${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-label={language === "en" ? "oiia house" : "oiia домик"}
    >
      <header className="writing-shop-header">
        <strong>{language === "en" ? "oiia house" : "oiia домик"}</strong>
        <div className="writing-house-actions">
          <button
            type="button"
            className="writing-timer-button writing-house-expand"
            onClick={() => setExpanded((value) => !value)}
            aria-label={sizeLabel}
            aria-pressed={expanded}
            aria-controls="writing-house-canvas"
            data-tooltip={sizeLabel}
          >
            <Maximize2
              size={18}
              className={`writing-house-size-icon${expanded ? " is-hidden" : ""}`}
              aria-hidden="true"
            />
            <Minimize2
              size={18}
              className={`writing-house-size-icon${expanded ? "" : " is-hidden"}`}
              aria-hidden="true"
            />
          </button>
          <button
            ref={closeRef}
            type="button"
            className="writing-timer-button"
            onClick={onClose}
            aria-label={language === "en" ? "Close house" : "Закрыть домик"}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="writing-popover-scroll">
        <div id="writing-house-canvas" className="writing-house-canvas">
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
        </div>
      </div>
    </aside>
  );
}
