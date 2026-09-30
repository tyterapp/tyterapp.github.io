import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { DOCUMENT_FONTS } from "./document-fonts.js";

export default function DocumentSettings({
  metadata = {},
  fontSize,
  onChange,
  onSize,
  onClose,
}) {
  const file = useRef(null);
  const [error, setError] = useState("");
  const upload = async (e) => {
    const image = e.target.files?.[0];
    e.target.value = "";
    if (!image) return;
    if (
      !/^image\/(png|jpeg|webp)$/.test(image.type) ||
      image.size > 5 * 1024 * 1024
    ) {
      setError("Выберите JPG, PNG или WebP размером до 5 МБ.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(image);
      const scale = Math.min(1, 1000 / bitmap.width, 1500 / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      setError("");
      onChange({ poster: canvas.toDataURL("image/jpeg", 0.82) });
    } catch {
      setError("Не удалось прочитать изображение.");
    }
  };
  return (
    <aside className="settings-drawer" aria-label="Настройки документа">
      <div className="drawer-heading">
        <h2>Настройки документа</h2>
        <button
          className="icon-button"
          aria-label="Закрыть настройки"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="settings-scroll">
        <section className="metadata-fields">
          <label>
            Шрифт в редакторе
            <select
              aria-label="Шрифт в редакторе"
              value={metadata.fontFamily || "courier"}
              onChange={(e) => onChange({ fontFamily: e.target.value })}
            >
              {DOCUMENT_FONTS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-hint">
            Экспорт PDF, DOCX и FDX всегда использует Courier.
          </p>
        </section>
        <section>
          <label className="size-label" htmlFor="script-size">
            Размер шрифта <output>{fontSize} pt</output>
          </label>
          <input
            id="script-size"
            aria-label="Размер шрифта"
            type="range"
            min="12"
            max="26"
            step="1"
            value={fontSize}
            onChange={(e) => onSize(Number(e.target.value))}
          />
          <div className="range-labels">
            <span>12 pt</span>
            <span>26 pt</span>
          </div>
          <p className="settings-hint">Ctrl + колесо мыши на листе</p>
        </section>
        <section>
          <h3>Нижняя панель</h3>
          <div
            className="format-bar-mode-toggle"
            role="group"
            aria-label="Вид нижней панели"
          >
            {[
              ["text", "Текст"],
              ["icons", "Иконки"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={(metadata.formatBarMode || "text") === mode}
                onClick={() => onChange({ formatBarMode: mode })}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>Обложка</h3>
          <button
            className={`poster-upload${metadata.poster ? " has-poster" : ""}`}
            onClick={() => file.current.click()}
            aria-label="Загрузить обложку"
          >
            {metadata.poster ? (
              <img src={metadata.poster} alt="Обложка сценария" />
            ) : (
              <>
                <ImagePlus size={26} />
                <span>Добавить постер</span>
                <small>JPG, PNG, WebP · до 5 МБ</small>
              </>
            )}
          </button>
          {metadata.poster && (
            <button
              className="quiet-button"
              onClick={() => onChange({ poster: null })}
            >
              Убрать обложку
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={upload}
          />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </section>
        <section className="metadata-fields">
          <h3>Авторство</h3>
          <label>
            Автор
            <input
              aria-label="Автор"
              value={metadata.author || ""}
              maxLength={200}
              onChange={(e) => onChange({ author: e.target.value })}
              placeholder="Имя автора"
            />
          </label>
          <label>
            Год
            <input
              aria-label="Год"
              inputMode="numeric"
              maxLength={4}
              value={metadata.year || ""}
              onChange={(e) =>
                onChange({
                  year: e.target.value.replace(/\D/g, "").slice(0, 4),
                })
              }
              placeholder={String(new Date().getFullYear())}
            />
          </label>
          <label>
            Email автора
            <input
              type="email"
              aria-label="Email автора"
              value={metadata.email || ""}
              maxLength={254}
              onChange={(e) => onChange({ email: e.target.value })}
              placeholder="author@example.com"
            />
          </label>
        </section>
      </div>
    </aside>
  );
}
