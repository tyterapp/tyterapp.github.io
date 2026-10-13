import { useEffect, useId, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronsUpDown,
  Download,
  ImagePlus,
  RotateCcw,
  X,
} from "lucide-react";
import AppSelect from "./AppSelect.jsx";
import ShotLocationPicker from "./ShotLocationPicker.jsx";
import { imageThumbnail } from "./image-thumbnail.js";
import { getLanguage, t, useLanguage } from "./i18n.js";
import {
  SHOT_FIELDS,
  FORMAT_NAMES,
  durationLabel,
  shotText,
} from "./shot-info.js";
import { shotAspectRatio } from "./shot-image.js";
const text = (pair) => pair[getLanguage() === "en" ? 1 : 0];

function ShotProperty({ name, property, open, onToggle, children }) {
  const id = useId();
  return (
    <div className="shot-property" data-property={property}>
      <button
        className="shot-property-heading"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span>{name}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div id={id} className="shot-property-body" hidden={!open}>
        {open ? children : null}
      </div>
    </div>
  );
}

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
  const [expansion, setExpansion] = useState({ scope: sceneKey, values: {} });
  const overrides = expansion.scope === sceneKey ? expansion.values : {};
  const settings = scene.settings;
  const ratio = shotAspectRatio(settings.aspectRatio);
  const assigned = {
    name: !!settings.name?.trim(),
    shootingDate: !!settings.shootingDate,
    location: !!settings.location,
    duration: scene.blocks.some((block) => shotText(block).trim()),
    ...Object.fromEntries(
      SHOT_FIELDS.map((field) => [
        field.key,
        !!settings[field.key] ||
          (field.key === "timeOfDay" && !!scene.timeOfDay),
      ]),
    ),
    excludeNudity: settings.excludeNudity !== undefined,
    excludeViolence: settings.excludeViolence !== undefined,
  };
  const isOpen = (key) => overrides[key] ?? !!assigned[key];
  const allOpen = Object.keys(assigned).every(isOpen);
  const toggle = (key) =>
    setExpansion({
      scope: sceneKey,
      values: { ...overrides, [key]: !isOpen(key) },
    });
  const toggleAll = () =>
    setExpansion({
      scope: sceneKey,
      values: Object.fromEntries(
        Object.keys(assigned).map((key) => [key, !allOpen]),
      ),
    });
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    setError("");
  }, [sceneKey]);
  useEffect(() => setImageError(false), [settings.image]);
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
  const property = (key, name, children) => (
    <ShotProperty
      key={`${sceneKey}:${key}`}
      name={name}
      property={key}
      open={isOpen(key)}
      onToggle={() => toggle(key)}
    >
      {children}
    </ShotProperty>
  );
  const selectProperty = (field) => {
    const inferred =
      field.key === "timeOfDay"
        ? field.options.find(([value]) => value === scene.timeOfDay)
        : null;
    return property(
      field.key,
      text(field.label),
      <>
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
        {field.key === "aspectRatio" && (
          <small className="shot-help">
            {t("Кадрирование по центру. Оригинал сохраняется.")}
          </small>
        )}
      </>,
    );
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
        <div className="shot-header-actions">
          <button
            className="icon-button"
            onClick={toggleAll}
            aria-label={t(
              allOpen ? "Свернуть все свойства" : "Развернуть все свойства",
            )}
            data-tooltip={t(
              allOpen ? "Свернуть все свойства" : "Развернуть все свойства",
            )}
          >
            <ChevronsUpDown size={17} />
          </button>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Закрыть информацию о кадре")}
          >
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="shot-info-scroll" ref={body}>
        <button
          className="shot-scene-title"
          onClick={() => onGo(scene.id)}
          title={t("Перейти к тексту")}
        >
          {scene.title || t("Без названия")}
        </button>
        <section
          className="shot-section shot-image-section"
          aria-label={t("Пример кадра")}
        >
          <div className="shot-image-actions">
            <button
              className="quiet-button"
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={16} />
              {settings.image ? t("Заменить картинку") : t("Загрузить кадр")}
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
          {selectProperty(
            SHOT_FIELDS.find((field) => field.key === "aspectRatio"),
          )}
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
          {settings.image && (
            <figure className="shot-reference">
              {!imageError ? (
                <div
                  className={`shot-image-frame${ratio ? " is-cropped" : ""}`}
                  style={
                    ratio
                      ? {
                          aspectRatio: ratio,
                          width: `min(100%, ${320 * ratio}px)`,
                        }
                      : undefined
                  }
                >
                  <img
                    src={settings.image}
                    alt={t("Прикреплённый пример кадра")}
                    onError={() => setImageError(true)}
                  />
                </div>
              ) : (
                <div className="shot-reference-unavailable">
                  {t(
                    "Пример кадра недоступен. Добавьте изображение с устройства.",
                  )}
                </div>
              )}
              <figcaption>{t("Ваш пример кадра")}</figcaption>
            </figure>
          )}
        </section>
        <section className="shot-section shot-main-settings">
          {property(
            "name",
            t("Название шота"),
            <input
              className="shot-name-input"
              aria-label={t("Название шота")}
              value={settings.name || ""}
              maxLength={180}
              placeholder={t("Например, встреча у окна")}
              onChange={(event) => onChange({ name: event.target.value })}
            />,
          )}
          {property(
            "shootingDate",
            t("Дата съёмок"),
            <input
              className="shot-name-input"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              aria-label={t("Дата съёмок")}
              value={settings.shootingDate || ""}
              onChange={(event) =>
                onChange({ shootingDate: event.target.value })
              }
            />,
          )}
          {property(
            "location",
            t("Локация съёмок"),
            <ShotLocationPicker
              key={sceneKey}
              value={settings.location}
              onChange={(location) => onChange({ location })}
            />,
          )}
          {property(
            "duration",
            t("Хронометраж сцены"),
            <>
              <div className="shot-duration">
                <small>{t("Автоматически · 1 страница = 1 минута")}</small>
                <output aria-label={t("Хронометраж сцены")}>
                  {durationLabel(scene.seconds)}
                </output>
              </div>
              <p className="shot-help">
                {t("Оценка по сценарию Courier, без учёта масштаба экрана.")}
              </p>
            </>,
          )}
          {SHOT_FIELDS.filter((field) => field.key !== "aspectRatio").map(
            selectProperty,
          )}
          {[
            ["excludeNudity", "Исключить наготу"],
            ["excludeViolence", "Исключить насилие"],
          ].map(([key, name]) =>
            property(
              key,
              t(name),
              <label className="shot-flag-control">
                <input
                  type="checkbox"
                  checked={settings[key] !== false}
                  onChange={(event) =>
                    onChange({ [key]: event.target.checked })
                  }
                />
                {t(name)}
              </label>,
            ),
          )}
          <button
            className="quiet-button shot-reset"
            onClick={() => {
              setExpansion({ scope: sceneKey, values: {} });
              onChange(null);
            }}
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
