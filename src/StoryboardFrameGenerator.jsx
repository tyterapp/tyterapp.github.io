import { useEffect, useRef, useState } from "react";
import { Sparkles, X, RotateCcw } from "lucide-react";
import { getLanguage, useLanguage } from "./i18n.js";
import {
  generateStoryboardFrames,
  generatedImageFile,
  generationDescription,
} from "./storyboard-generation.js";
import { storyboardImage } from "./storyboard-image.js";
import { shotAspectRatio } from "./shot-image.js";

const tr = (ru, en) => (getLanguage() === "en" ? en : ru);
const message = (code) =>
  ({
    description: tr(
      "Добавьте описание сцены длиной до 4000 символов.",
      "Add a scene description of up to 4,000 characters.",
    ),
    count: tr(
      "Можно создать от 2 до 4 кадров за один раз.",
      "You can generate 2 to 4 frames at a time.",
    ),
    busy: tr(
      "В бесплатной очереди сейчас много запросов. Попробуйте позже.",
      "The free queue is busy. Please try again later.",
    ),
    anonymous: tr(
      "AI Horde временно ограничил генерацию без регистрации. Попробуйте позже или загрузите изображения.",
      "AI Horde is temporarily limiting anonymous generation. Try later or upload images.",
    ),
    workers: tr(
      "Сейчас нет свободных исполнителей для этого запроса. Попробуйте позже.",
      "No compatible workers are available right now. Please try again later.",
    ),
    network: tr(
      "Не удалось связаться с AI Horde. Проверьте соединение и попробуйте ещё раз.",
      "Could not reach AI Horde. Check your connection and try again.",
    ),
    timeout: tr(
      "Ожидание заняло слишком много времени. Запрос отменён; попробуйте позже.",
      "The queue took too long. The request was cancelled; please try later.",
    ),
    empty: tr(
      "Сервис не вернул доступные изображения. Попробуйте изменить описание.",
      "The service returned no usable images. Try changing the description.",
    ),
    image: tr(
      "Не удалось прочитать сгенерированное изображение. Попробуйте ещё раз.",
      "Could not read a generated image. Please try again.",
    ),
    request: tr(
      "Сервис не принял запрос. Измените описание или количество кадров.",
      "The service rejected this request. Change the description or frame count.",
    ),
    service: tr(
      "AI Horde временно недоступен. Ваши слайды сохранены; попробуйте позже.",
      "AI Horde is temporarily unavailable. Your slides are safe; try again later.",
    ),
    capacity: tr(
      "В сцене недостаточно свободных слотов. Удалите ненужные слайды или выберите меньше кадров.",
      "This scene has too few free slots. Remove unused slides or choose fewer frames.",
    ),
  })[code] ||
  tr(
    "Не удалось создать кадры. Попробуйте ещё раз.",
    "Could not generate frames. Please try again.",
  );

export default function StoryboardFrameGenerator({
  scene,
  capacity,
  onInsert,
}) {
  useLanguage();
  const [open, setOpen] = useState(false),
    [description, setDescription] = useState(() =>
      generationDescription(scene),
    );
  const [count, setCount] = useState(3),
    [style, setStyle] = useState("sketch"),
    [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]),
    [selected, setSelected] = useState([]),
    [error, setError] = useState("");
  const active = useRef(null);
  useEffect(
    () => () => {
      active.current?.controller.abort();
      active.current = null;
    },
    [],
  );
  const cancel = () => {
    active.current?.controller.abort();
    active.current = null;
    setProgress(null);
  };
  const generate = async () => {
    if (active.current) return;
    if (count > capacity) {
      setError("capacity");
      return;
    }
    const task = { controller: new AbortController() };
    active.current = task;
    setResults([]);
    setSelected([]);
    setError("");
    try {
      const images = await generateStoryboardFrames(
        {
          description,
          count,
          style,
          aspectRatio: shotAspectRatio(scene.settings.aspectRatio),
        },
        {
          signal: task.controller.signal,
          onProgress: (value) => {
            if (active.current === task) setProgress(value);
          },
        },
      );
      const decoded = [];
      for (const image of images) {
        if (task.controller.signal.aborted || active.current !== task) return;
        setProgress({
          state: "loading",
          finished: decoded.length,
          total: images.length,
        });
        decoded.push(
          await storyboardImage(
            await generatedImageFile(image, { signal: task.controller.signal }),
          ),
        );
      }
      if (active.current !== task || task.controller.signal.aborted) return;
      setResults(decoded);
      setSelected(decoded.map((_, index) => index));
    } catch (cause) {
      if (active.current === task && cause.name !== "AbortError")
        setError(cause.code || "image");
    } finally {
      if (active.current === task) {
        active.current = null;
        setProgress(null);
      }
    }
  };
  const stage =
    progress &&
    {
      submitting: tr("Отправляем описание…", "Submitting description…"),
      queued: tr("Ожидаем в бесплатной очереди…", "Waiting in the free queue…"),
      generating: tr("Создаём кадры…", "Generating frames…"),
      reconnecting: tr("Восстанавливаем соединение…", "Reconnecting…"),
      loading: tr("Загружаем результат…", "Loading results…"),
    }[progress.state];
  return (
    <section
      className="story-generator"
      aria-label={tr("Генерация кадров", "Frame generation")}
    >
      <button
        type="button"
        className="quiet-button story-generator-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Sparkles size={17} />
        {tr("Создать кадры по описанию", "Generate frames from description")}
      </button>
      {open && (
        <div className="story-generator-form">
          <p className="story-help">
            {tr(
              "Бесплатно через AI Horde, без регистрации. Описание будет отправлено сервису; время ожидания зависит от очереди.",
              "Free via AI Horde, without registration. Your description will be sent to the service; waiting time depends on the queue.",
            )}{" "}
            <a
              href="https://aihorde.net/"
              target="_blank"
              rel="noopener noreferrer"
            >
              AI Horde ↗
            </a>
          </p>
          <label>
            {tr("Описание для генерации", "Generation description")}
            <textarea
              aria-label={tr(
                "Описание для генерации",
                "Generation description",
              )}
              maxLength={4000}
              rows={5}
              value={description}
              disabled={!!progress}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={tr(
                "Персонажи, место, действие и ракурс…",
                "Characters, setting, action and camera angle…",
              )}
            />
          </label>
          <button
            type="button"
            className="quiet-button"
            disabled={!!progress}
            onClick={() => setDescription(generationDescription(scene))}
          >
            <RotateCcw size={14} />
            {tr("Взять описание сцены", "Use scene description")}
          </button>
          <div className="story-generator-options">
            <label>
              {tr("Количество кадров", "Frame count")}
              <select
                aria-label={tr("Количество кадров", "Frame count")}
                value={count}
                disabled={!!progress}
                onChange={(event) => setCount(Number(event.target.value))}
              >
                {[2, 3, 4].map((value) => (
                  <option key={value} value={value} disabled={value > capacity}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Стиль кадров", "Frame style")}
              <select
                aria-label={tr("Стиль кадров", "Frame style")}
                value={style}
                disabled={!!progress}
                onChange={(event) => setStyle(event.target.value)}
              >
                <option value="sketch">
                  {tr("Карандашный эскиз", "Pencil storyboard")}
                </option>
                <option value="cinematic">
                  {tr("Кинокадр", "Cinematic still")}
                </option>
              </select>
            </label>
          </div>
          {progress ? (
            <div className="story-generation-progress" role="status">
              <strong>{stage}</strong>
              <progress max={progress.total} value={progress.finished} />
              <span>
                {tr("Готово", "Ready")}: {progress.finished}/{progress.total}
                {progress.waitSeconds > 0
                  ? ` · ~${Math.ceil(progress.waitSeconds / 60)} ${tr("мин", "min")}`
                  : ""}
              </span>
              <button className="quiet-button" onClick={cancel}>
                <X size={16} />
                {tr("Отменить генерацию", "Cancel generation")}
              </button>
            </div>
          ) : (
            <button
              className="quiet-button story-generate-submit"
              onClick={generate}
              disabled={!description.trim() || count > capacity}
            >
              <Sparkles size={17} />
              {tr(`Сгенерировать ${count} кадра`, `Generate ${count} frames`)}
            </button>
          )}
          {count > capacity && (
            <p className="story-help">{message("capacity")}</p>
          )}
          {error && (
            <p className="story-generation-error" role="alert">
              {message(error)}
            </p>
          )}
          {!!results.length && (
            <div className="story-generation-results">
              <p>
                {tr(
                  "Выберите кадры для добавления в сцену.",
                  "Choose frames to add to this scene.",
                )}
              </p>
              <div className="story-generation-grid">
                {results.map((image, index) => (
                  <label key={index}>
                    <img
                      src={image}
                      alt={`${tr("Сгенерированный кадр", "Generated frame")} ${index + 1}`}
                    />
                    <span>
                      <input
                        type="checkbox"
                        checked={selected.includes(index)}
                        aria-label={`${tr("Добавить кадр", "Add frame")} ${index + 1}`}
                        onChange={(event) =>
                          setSelected((value) =>
                            event.target.checked
                              ? [...value, index].sort((a, b) => a - b)
                              : value.filter((id) => id !== index),
                          )
                        }
                      />
                      {index + 1}
                    </span>
                  </label>
                ))}
              </div>
              <button
                className="quiet-button story-generate-submit"
                disabled={!selected.length || selected.length > capacity}
                onClick={() => {
                  if (
                    onInsert(selected.map((index) => results[index])) !== false
                  ) {
                    setResults([]);
                    setSelected([]);
                  } else setError("capacity");
                }}
              >
                {tr("Добавить выбранные кадры", "Add selected frames")} (
                {selected.length})
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
