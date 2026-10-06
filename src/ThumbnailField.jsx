import { t, useLanguage, languageLocale } from "./i18n.js";
import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
export function ThumbnailImage({ src, name, className = "" }) {
  const language = useLanguage();
  return src ? (
    <img
      className={`annotation-thumbnail ${className}`}
      src={src}
      alt={t("Миниатюра: {0}", name)}
      data-thumbnail-preview="true"
    />
  ) : null;
}
export default function ThumbnailField({ value, onChange, name, showPreview }) {
  const language = useLanguage();
  const input = useRef(null);
  const [error, setError] = useState("");
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      !/^image\/(png|jpeg|webp)$/.test(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Выберите JPG, PNG или WebP размером до 5 МБ.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 640 / bitmap.width, 640 / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      onChange(canvas.toDataURL("image/jpeg", 0.85));
      setError("");
    } catch {
      setError("Не удалось прочитать изображение.");
    }
  };
  return (
    <div className="thumbnail-field">
      <span>
        {t("Миниатюра ")}
        <span className="muted">{t("· необязательно")}</span>
      </span>
      {showPreview && (
        <ThumbnailImage
          src={value}
          name={name}
          className="thumbnail-field-image"
        />
      )}
      <div className="thumbnail-field-actions">
        <button
          type="button"
          className="quiet-button"
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={16} />
          {value ? t("Заменить картинку") : t("Загрузить картинку")}
        </button>
        {value && (
          <button
            type="button"
            className="icon-button"
            aria-label={t("Удалить миниатюру")}
            data-tooltip={t("Удалить миниатюру")}
            onClick={() => {
              onChange(null);
              setError("");
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label={t("Файл миниатюры")}
        hidden
        onChange={upload}
      />
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
