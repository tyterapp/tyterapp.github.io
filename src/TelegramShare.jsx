import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ExternalLink, Send, X } from "lucide-react";
import { t } from "./i18n.js";
import { telegramLink } from "./telegram.js";
import "./telegram.css";

export default function TelegramShare({ text, language, onClose }) {
  const [link] = useState(() => telegramLink(text, language));
  const [feedback, setFeedback] = useState("");
  const dialog = useRef(null),
    input = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const node = dialog.current;
    node.showModal();
    return () => {
      node.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setFeedback("Ссылка скопирована");
    } catch {
      input.current?.focus();
      input.current?.select();
      setFeedback("Скопируйте ссылку из поля.");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: t("Телеграмма"), url: link });
    } catch (error) {
      if (error.name !== "AbortError")
        setFeedback("Не удалось открыть меню отправки. Скопируйте ссылку.");
    }
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="minimal-dialog telegram-share"
      aria-labelledby="telegram-share-title"
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
      <div className="dialog-heading">
        <h2 id="telegram-share-title">{t("Поделиться телеграммой")}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={t("Закрыть")}
          autoFocus
        >
          <X size={18} />
        </button>
      </div>
      <div className="telegram-share-preview" lang={language}>
        {text}
      </div>
      <p className="telegram-share-note">
        {t(
          "По ссылке откроется только текст телеграммы с воспроизведением Морзе.",
        )}
      </p>
      <label className="telegram-share-link">
        <span>{t("Ссылка на телеграмму")}</span>
        <input
          ref={input}
          value={link}
          readOnly
          onFocus={(event) => event.target.select()}
        />
      </label>
      <div className="telegram-share-actions">
        <button type="button" className="house-photo-action" onClick={copy}>
          {feedback === "Ссылка скопирована" ? (
            <Check size={18} />
          ) : (
            <Copy size={18} />
          )}
          {t("Копировать ссылку")}
        </button>
        {typeof navigator.share === "function" ? (
          <button type="button" className="house-photo-action" onClick={share}>
            <Send size={18} />
            {t("Отправить")}
          </button>
        ) : (
          <a
            className="house-photo-action"
            href={`https://t.me/share/url?url=${encodeURIComponent(link)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Send size={18} />
            {t("Отправить")}
          </a>
        )}
        <a
          className="house-photo-action"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={18} />
          {t("Открыть")}
        </a>
      </div>
      <p className="telegram-share-feedback" role="status">
        {t(feedback)}
      </p>
    </dialog>,
    document.body,
  );
}
