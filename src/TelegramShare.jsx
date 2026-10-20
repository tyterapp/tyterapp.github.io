import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, ExternalLink, Send, X } from "lucide-react";
import { t } from "./i18n.js";
import { telegramLink } from "./telegram.js";
import { publishTelegram } from "./telegram-service.js";
import "./telegram.css";

export default function TelegramShare({ text, title, language, onClose }) {
  const [link, setLink] = useState(() =>
    telegramLink(text, language, location.href, title),
  );
  const [cover, setCover] = useState(null);
  const [feedback, setFeedback] = useState("");
  const dialog = useRef(null),
    input = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    publishTelegram(
      { version: 1, text, title, language },
      { signal: controller.signal },
    )
      .then((url) => {
        if (url && !controller.signal.aborted) setLink(url);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setFeedback(
            "Сервис обложек недоступен. Используется переносимая ссылка.",
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [text, title, language]);
  useEffect(() => {
    let cancelled = false,
      url;
    setCover(null);
    import("./telegram-cover.js")
      .then(({ telegramCover }) =>
        telegramCover({ text, title, language }, link),
      )
      .then((result) => {
        if (cancelled) return;
        url = URL.createObjectURL(result.blob);
        setCover({ ...result, url });
      })
      .catch(() => {
        if (!cancelled)
          setFeedback("Не удалось создать обложку. Ссылка остаётся доступна.");
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [link, text, title, language]);
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
      {cover && (
        <img
          className="telegram-cover-preview"
          src={cover.url}
          alt={t("Обложка телеграммы")}
          width="1200"
          height="630"
        />
      )}
      <p className="telegram-share-note">
        {t(
          "По ссылке откроется только текст телеграммы с воспроизведением Морзе.",
        )}
      </p>
      {cover && !cover.qrAvailable && (
        <p className="telegram-cover-note">
          {t(
            "Текст слишком длинный для QR-кода переносимой ссылки. Отправьте саму ссылку; после подключения сервиса QR будет доступен и для длинных телеграмм.",
          )}
        </p>
      )}
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
        {cover && (
          <a
            className="house-photo-action"
            href={cover.url}
            download="tyter-telegram.png"
          >
            <Download size={18} />
            {t("Скачать обложку")}
          </a>
        )}
        {cover &&
          navigator.canShare?.({
            files: [
              new File([cover.blob], "tyter-telegram.png", {
                type: "image/png",
              }),
            ],
          }) && (
            <button
              type="button"
              className="house-photo-action"
              onClick={async () => {
                try {
                  await navigator.share({
                    files: [
                      new File([cover.blob], "tyter-telegram.png", {
                        type: "image/png",
                      }),
                    ],
                    text: link,
                  });
                } catch (error) {
                  if (error.name !== "AbortError")
                    setFeedback(
                      "Не удалось отправить обложку. Скачайте её и отправьте вместе со ссылкой.",
                    );
                }
              }}
            >
              <Send size={18} />
              {t("Отправить обложку")}
            </button>
          )}
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
