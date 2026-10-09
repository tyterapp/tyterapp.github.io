import { t, useLanguage, languageLocale } from "./i18n.js";
import { useRef, useState } from "react";
import {
  ImagePlus,
  X,
  Sun,
  Moon,
  Volume2,
  SpellCheck,
  Type,
  ZoomIn,
  PanelBottom,
  UserRound,
} from "lucide-react";
import { documentFont, documentFonts } from "./document-fonts.js";
import AppSelect from "./AppSelect.jsx";

function SettingsSwitch({ label, checked, onChange, icon: Icon, hint }) {
  return (
    <label className="settings-switch-row">
      <span className="settings-option-icon">
        <Icon size={17} />
      </span>
      <span className="settings-switch-copy">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
export default function DocumentSettings({
  metadata = {},
  spellcheck = false,
  onSpellcheck,
  preferences = { theme: "light", typewriter: false },
  onPreferences,
  documentZoom,
  onChange,
  onZoom,
  onClose,
}) {
  const language = useLanguage();
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
      onChange({
        poster: canvas.toDataURL("image/jpeg", 0.82),
      });
    } catch {
      setError("Не удалось прочитать изображение.");
    }
  };
  return (
    <aside className="settings-drawer" aria-label={t("Настройки документа")}>
      <div className="drawer-heading">
        <h2>{t("Настройки документа")}</h2>
        <button
          className="icon-button"
          aria-label={t("Закрыть настройки")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="settings-scroll">
        <section className="settings-section">
          <h3>
            <Sun size={15} />
            {t("Оформление")}
          </h3>
          <div className="settings-field">
            <span>{t("Тема интерфейса")}</span>
            <AppSelect
              label={t("Тема интерфейса")}
              value={preferences.theme}
              options={[
                {
                  value: "light",
                  label: t("Светлая"),
                  icon: <Sun size={16} />,
                },
                { value: "dark", label: t("Тёмная"), icon: <Moon size={16} /> },
              ]}
              onChange={(theme) => onPreferences({ theme })}
            />
          </div>
          <SettingsSwitch
            label={t("Звук печатной машинки")}
            icon={Volume2}
            checked={preferences.typewriter}
            onChange={(typewriter) => onPreferences({ typewriter })}
          />
        </section>
        <section className="settings-section">
          <h3>
            <Type size={15} />
            {t("Редактор")}
          </h3>
          <SettingsSwitch
            label={t("Подсветка орфографии")}
            icon={SpellCheck}
            checked={spellcheck}
            onChange={onSpellcheck}
            hint={
              language === "en"
                ? t("Язык проверки — английский")
                : t("Язык проверки — русский")
            }
          />
          <div className="settings-field">
            <span>{t("Шрифт в редакторе")}</span>
            <AppSelect
              label={t("Шрифт в редакторе")}
              value={documentFont(metadata.fontFamily, language).id}
              options={documentFonts(language).map((font) => ({
                value: font.id,
                label: font.name,
              }))}
              onChange={(fontFamily) => onChange({ fontFamily })}
            />
          </div>
          <p className="settings-hint">
            {t("Экспорт PDF, DOCX и FDX всегда использует Courier.")}
          </p>
        </section>
        <section className="settings-section">
          <h3>
            <ZoomIn size={15} />
            {t("Масштаб документа")}
          </h3>
          <label className="size-label" htmlFor="document-zoom">
            {t("Масштаб документа ")}
            <output>{documentZoom}%</output>
          </label>
          <input
            id="document-zoom"
            className="app-range"
            aria-label={t("Масштаб документа")}
            type="range"
            min="100"
            max="200"
            step="10"
            value={documentZoom}
            style={{ "--range-progress": `${documentZoom - 100}%` }}
            onChange={(e) => onZoom(Number(e.target.value))}
          />
          <div className="range-labels">
            <span>100%</span>
            <span>200%</span>
          </div>
          <p className="settings-hint">{t("Ctrl + колесо мыши на листе")}</p>
        </section>
        <section className="settings-section">
          <h3>
            <PanelBottom size={15} />
            {t("Нижняя панель")}
          </h3>
          <div
            className="format-bar-mode-toggle"
            role="group"
            aria-label={t("Вид нижней панели")}
          >
            {[
              ["text", t("Текст")],
              ["icons", t("Иконки")],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={(metadata.formatBarMode || "text") === mode}
                onClick={() =>
                  onChange({
                    formatBarMode: mode,
                  })
                }
              >
                {t(label)}
              </button>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <h3>
            <ImagePlus size={15} />
            {t("Обложка")}
          </h3>
          <div className="settings-poster-row">
            <button
              className={`poster-upload${metadata.poster ? " has-poster" : ""}`}
              onClick={() => file.current.click()}
              aria-label={t("Загрузить обложку")}
            >
              {metadata.poster ? (
                <img src={metadata.poster} alt={t("Обложка сценария")} />
              ) : (
                <>
                  <ImagePlus size={24} />
                </>
              )}
            </button>
            <div className="settings-poster-actions">
              <span>{t("Обложка сценария")}</span>
              <small>{t("JPG, PNG, WebP · до 5 МБ")}</small>
              <button
                type="button"
                className="quiet-button"
                onClick={() => file.current?.click()}
              >
                {metadata.poster ? t("Заменить постер") : t("Добавить постер")}
              </button>
              {metadata.poster && (
                <button
                  className="quiet-button"
                  onClick={() =>
                    onChange({
                      poster: null,
                    })
                  }
                >
                  {t("Убрать обложку")}
                </button>
              )}
            </div>
          </div>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={upload}
          />
          {error && (
            <p role="alert" className="form-error">
              {t(error)}
            </p>
          )}
        </section>
        <section className="settings-section metadata-fields">
          <h3>
            <UserRound size={15} />
            {t("Авторство")}
          </h3>
          <div className="settings-author-row">
            <label>
              {t("Автор")}
              <input
                aria-label={t("Автор")}
                value={metadata.author || ""}
                maxLength={200}
                onChange={(e) =>
                  onChange({
                    author: e.target.value,
                  })
                }
                placeholder={t("Имя автора")}
              />
            </label>
            <label>
              {t("Год")}
              <input
                aria-label={t("Год")}
                inputMode="numeric"
                maxLength={4}
                value={metadata.year || ""}
                onChange={(e) =>
                  onChange({
                    year: e.target.value.replace(/\D/g, "").slice(0, 4),
                  })
                }
                placeholder={t(String(new Date().getFullYear()))}
              />
            </label>
          </div>
          <label>
            {t("Email автора")}
            <input
              type="email"
              aria-label={t("Email автора")}
              value={metadata.email || ""}
              maxLength={254}
              onChange={(e) =>
                onChange({
                  email: e.target.value,
                })
              }
              placeholder="author@example.com"
            />
          </label>
        </section>
      </div>
    </aside>
  );
}
