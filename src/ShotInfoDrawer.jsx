import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, RotateCcw, X } from "lucide-react";
import AppSelect from "./AppSelect.jsx";
import { imageThumbnail } from "./image-thumbnail.js";
import { getLanguage, t, useLanguage } from "./i18n.js";
import {
  SHOT_FIELDS,
  SHOT_REFERENCES,
  FORMAT_NAMES,
  durationLabel,
  shotText,
} from "./shot-info.js";
const text = (pair) => pair[getLanguage() === "en" ? 1 : 0];

export default function ShotInfoDrawer({
  scene,
  onChange,
  onClose,
  onGo,
  onExport,
  busy,
}) {
  useLanguage();
  const input = useRef(null),
    body = useRef(null),
    sceneKey = `${scene.id}:${scene.letter}`;
  const target = useRef(sceneKey);
  target.current = sceneKey;
  const [error, setError] = useState(""),
    [imageError, setImageError] = useState(false);
  const settings = scene.settings;
  const reference =
    SHOT_REFERENCES.find((ref) => ref.id === settings.reference) ||
    SHOT_REFERENCES[0];
  const image = settings.image || reference.image;
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    setError("");
  }, [sceneKey]);
  useEffect(() => setImageError(false), [image]);
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const key = sceneKey;
    try {
      const image = await imageThumbnail(file, 5 * 1024 * 1024);
      if (target.current === key) {
        onChange({ image });
        setError("");
      }
    } catch (error) {
      if (target.current === key) setError(error.message);
    }
  };
  return (
    <aside className="shot-info-drawer" aria-label={t("Информация о кадре")}>
      <header className="shot-info-header">
        <div>
          <h2>{t("Информация о кадре")}</h2>
          <span>
            {t("Сцена {0}", scene.number)} · {t("Вариант {0}", scene.letter)}
          </span>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("Закрыть информацию о кадре")}
        >
          <X size={18} />
        </button>
      </header>
      <div className="shot-info-scroll" ref={body}>
        <button
          className="shot-scene-title"
          onClick={() => onGo(scene.id)}
          title={t("Перейти к тексту")}
        >
          {scene.title || t("Без названия")}
        </button>
        <section className="shot-section" aria-label={t("Пример кадра")}>
          <figure className="shot-reference">
            {!imageError ? (
              <img
                src={image}
                alt={
                  settings.image
                    ? t("Прикреплённый пример кадра")
                    : reference.title
                }
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="shot-reference-unavailable">
                {t(
                  "Пример кадра недоступен. Добавьте изображение с устройства.",
                )}
              </div>
            )}
            <figcaption>
              {settings.image ? t("Ваш пример кадра") : reference.title}
            </figcaption>
          </figure>
          <div className="shot-image-actions">
            <button
              className="quiet-button"
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={16} />
              {settings.image ? t("Заменить картинку") : t("Добавить пример")}
            </button>
            {settings.image && (
              <button
                className="icon-button"
                aria-label={t("Удалить пример кадра")}
                onClick={() => onChange({ image: "" })}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={upload}
          />
          {error && (
            <p role="alert" className="shot-upload-error">
              {t(error)}
            </p>
          )}
          {!settings.image && (
            <AppSelect
              label={t("Пример кадра")}
              value={reference.id}
              options={SHOT_REFERENCES.map((ref) => ({
                value: ref.id,
                label: ref.title,
              }))}
              onChange={(reference) => onChange({ reference })}
            />
          )}
        </section>
        <section className="shot-section shot-main-settings">
          <label className="shot-field">
            <span>{t("Название шота")}</span>
            <input
              value={settings.name || ""}
              maxLength={180}
              placeholder={t("Например, встреча у окна")}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </label>
          <div className="shot-duration">
            <div>
              <span>{t("Хронометраж сцены")}</span>
              <small>{t("Автоматически · 1 страница = 1 минута")}</small>
            </div>
            <output aria-label={t("Хронометраж сцены")}>
              {durationLabel(scene.seconds)}
            </output>
          </div>
          <p className="shot-help">
            {t("Оценка по сценарию Courier, без учёта масштаба экрана.")}
          </p>
          {SHOT_FIELDS.map((field) => {
            const inferred =
              field.key === "timeOfDay"
                ? field.options.find(([value]) => value === scene.timeOfDay)
                : null;
            return (
              <div className="shot-field" key={field.key}>
                <span>{text(field.label)}</span>
                <AppSelect
                  label={text(field.label)}
                  value={settings[field.key] || ""}
                  options={[
                    {
                      value: "",
                      label: inferred
                        ? `${text([inferred[1], inferred[2]])} · ${t("из заголовка")}`
                        : field.key === "timeOfDay"
                          ? t("Из заголовка сцены")
                          : t("Не задано"),
                    },
                    ...field.options.map(([value, ru, en]) => ({
                      value,
                      label: text([ru, en]),
                    })),
                  ]}
                  onChange={(value) => onChange({ [field.key]: value })}
                />
                <small className="shot-help">
                  {t("Например: {0}", text(field.example))}
                </small>
              </div>
            );
          })}
          <div className="shot-content-flags">
            <label>
              <input
                type="checkbox"
                checked={settings.excludeNudity !== false}
                onChange={(event) =>
                  onChange({ excludeNudity: event.target.checked })
                }
              />
              {t("Исключить наготу")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.excludeViolence !== false}
                onChange={(event) =>
                  onChange({ excludeViolence: event.target.checked })
                }
              />
              {t("Исключить насилие")}
            </label>
            <small className="shot-help">
              {t(
                "Требования к кадру. Содержимое референсов автоматически не фильтруется.",
              )}
            </small>
          </div>
          <button
            className="quiet-button shot-reset"
            onClick={() => onChange(null)}
          >
            <RotateCcw size={15} />
            {t("Сбросить настройки кадра")}
          </button>
        </section>
        <section className="shot-section">
          <h3>{t("Текст сцены")}</h3>
          <p className="shot-help">
            {t("Нажмите на блок, чтобы перейти к нему в сценарии.")}
          </p>
          <ol className="shot-block-list">
            {scene.blocks.map((block, index) => (
              <li key={block.attrs.blockId || index}>
                <button onClick={() => onGo(block.attrs.blockId)}>
                  <span>
                    {text(
                      FORMAT_NAMES[block.attrs.format] || FORMAT_NAMES.action,
                    )}
                  </span>
                  <p>{shotText(block) || t("Пустой блок")}</p>
                </button>
              </li>
            ))}
          </ol>
        </section>
        <footer className="shot-source">
          {t("Примеры кадров взяты с сайта")}{" "}
          <a href="https://shotdeck.com/" target="_blank" rel="noreferrer">
            ShotDeck
          </a>
          .{" "}
          {settings.image &&
            t("Прикреплённое изображение добавлено пользователем.")}
        </footer>
      </div>
      <div className="shot-export">
        <button className="primary-button" disabled={busy} onClick={onExport}>
          <Download size={16} />
          {busy ? t("Подготовка файла…") : t("PDF-отчёт по всем сценам")}
        </button>
      </div>
    </aside>
  );
}
