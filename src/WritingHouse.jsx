import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Download,
  Link,
  Maximize2,
  Minimize2,
  Share2,
  X,
} from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { captureHouseSnapshot, HOUSE_ROOM } from "./house-snapshot.js";

export default function WritingHouse({ closing, onClose }) {
  const language = useLanguage();
  const closeRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const imageRef = useRef(null),
    scrollRef = useRef(null),
    photoRef = useRef(null),
    linkRef = useRef(null),
    photoUrl = useRef(null),
    captureRequest = useRef(0);
  const sizeLabel = t(
    expanded ? "Уменьшить домик до 100%" : "Увеличить домик до 200%",
  );
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      captureRequest.current++;
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    };
  }, []);
  useEffect(() => {
    const scroll = scrollRef.current,
      controls = photoRef.current;
    if (!photo || !scroll || !controls) return;
    scroll.scrollLeft = 0;
    const bounds = controls.getBoundingClientRect(),
      viewport = scroll.getBoundingClientRect();
    if (bounds.height > scroll.clientHeight)
      scroll.scrollTop += bounds.top - viewport.top;
    else if (bounds.bottom > viewport.bottom)
      scroll.scrollTop += bounds.bottom - viewport.bottom;
  }, [photo]);
  const capture = async () => {
    if (capturing || closing) return;
    const request = ++captureRequest.current;
    setCapturing(true);
    setError("");
    setFeedback("");
    try {
      const result = await captureHouseSnapshot(imageRef.current);
      if (request !== captureRequest.current) return;
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
      photoUrl.current = URL.createObjectURL(result.blob);
      setPhoto({ ...result, url: photoUrl.current });
    } catch {
      if (request === captureRequest.current)
        setError("Не удалось сделать снимок. Попробуйте ещё раз.");
    } finally {
      if (request === captureRequest.current) setCapturing(false);
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(photo.link);
      setFeedback("Ссылка скопирована");
    } catch {
      linkRef.current?.focus();
      linkRef.current?.select();
      setFeedback("Скопируйте ссылку из поля.");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: t("Снимок домика"), url: photo.link });
    } catch (error) {
      if (error.name !== "AbortError")
        setError("Не удалось открыть меню отправки. Скопируйте ссылку.");
    }
  };
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
            className="writing-timer-button writing-house-camera"
            onClick={capture}
            disabled={capturing || closing}
            aria-label={t("Сделать снимок домика")}
            aria-busy={capturing}
            aria-controls="writing-house-photo"
            aria-expanded={!!photo}
            data-tooltip={t("Сделать снимок домика")}
          >
            <Camera size={18} aria-hidden="true" />
          </button>
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
      <div ref={scrollRef} className="writing-popover-scroll">
        <div id="writing-house-canvas" className="writing-house-canvas">
          <img
            ref={imageRef}
            src={HOUSE_ROOM.image}
            alt={
              language === "en"
                ? "An empty room ready for your future pet"
                : "Пустая комната для будущего питомца"
            }
            width={HOUSE_ROOM.width}
            height={HOUSE_ROOM.height}
          />
        </div>
        {capturing && (
          <p className="writing-house-photo-status" role="status">
            {t("Создаём снимок…")}
          </p>
        )}
        {photo && (
          <section
            ref={photoRef}
            id="writing-house-photo"
            className="writing-house-photo"
            aria-label={t("Снимок домика")}
          >
            <strong>{t("Снимок готов")}</strong>
            <div className="writing-house-photo-actions">
              <button
                type="button"
                className="house-photo-action"
                onClick={copyLink}
                disabled={closing}
                aria-label={t("Копировать ссылку")}
              >
                <Link size={18} aria-hidden="true" />
                {t(
                  feedback === "Ссылка скопирована"
                    ? feedback
                    : "Копировать ссылку",
                )}
              </button>
              <a
                className="house-photo-action"
                href={photo.url}
                download={photo.filename}
              >
                <Download size={18} aria-hidden="true" />
                {t("Скачать PNG")}
              </a>
              {typeof navigator.share === "function" && (
                <button
                  type="button"
                  className="house-photo-action"
                  onClick={share}
                  disabled={closing}
                >
                  <Share2 size={18} aria-hidden="true" />
                  {t("Поделиться снимком")}
                </button>
              )}
            </div>
            <label className="writing-house-photo-link">
              <span>{t("Ссылка на снимок")}</span>
              <input
                ref={linkRef}
                aria-label={t("Ссылка на снимок")}
                value={photo.link}
                readOnly
                onFocus={(event) => event.target.select()}
                onMouseDown={(event) => event.stopPropagation()}
              />
            </label>
            {feedback && (
              <p className="writing-house-photo-status" role="status">
                {t(feedback)}
              </p>
            )}
          </section>
        )}
        {error && (
          <p className="writing-house-photo-error" role="alert">
            {t(error)}
          </p>
        )}
      </div>
    </aside>
  );
}
