import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ImagePlus, RefreshCw } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { imageThumbnail, transferFiles } from "./image-thumbnail.js";

export default forwardRef(function ImageComponentPaste(
  { containerRef, documentId, enabled, canCreate, onCreate, onError },
  ref,
) {
  useLanguage();
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const generation = useRef(0);
  const count = useRef(0);
  const queue = useRef(Promise.resolve());
  const insert = useRef(null);
  const config = useRef(null);
  config.current = { enabled, documentId, canCreate, onCreate, onError };

  useImperativeHandle(
    ref,
    () => ({ insert: (files) => insert.current?.(files) }),
    [],
  );
  useEffect(() => {
    const container = containerRef.current;
    let depth = 0;
    const cancel = () => {
      generation.current++;
      count.current = 0;
      depth = 0;
      setDragging(false);
      setProcessing(false);
    };
    cancel();
    const receive = (files) => {
      const options = config.current;
      setDragging(false);
      depth = 0;
      if (
        !options.enabled ||
        !files.length ||
        !options.canCreate(files.length, options.documentId)
      )
        return;
      const request = generation.current;
      const name = t("Без названия");
      count.current++;
      setProcessing(true);
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (request !== generation.current) return;
          // Validate the whole batch before creating any components.
          const thumbnails = [];
          for (const file of files) {
            if (request !== generation.current) return;
            thumbnails.push(await imageThumbnail(file));
          }
          if (request === generation.current)
            options.onCreate(thumbnails, options.documentId, name);
        })
        .catch((error) => {
          if (request === generation.current)
            config.current.onError(error.message);
        })
        .finally(() => {
          if (request !== generation.current) return;
          count.current--;
          if (!count.current) setProcessing(false);
        });
    };
    insert.current = receive;
    const hasFiles = (event) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");
    const enter = (event) => {
      if (!config.current.enabled || !hasFiles(event)) return;
      event.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (event) => {
      if (!config.current.enabled || !hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    };
    const leave = (event) => {
      if (
        event.relatedTarget instanceof Node &&
        container.contains(event.relatedTarget)
      )
        return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (event) => {
      if (!config.current.enabled || !hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      receive(transferFiles(event.dataTransfer));
    };
    const paste = (event) => {
      if (
        !config.current.enabled ||
        !container?.closest(".minimal-workspace")?.contains(event.target)
      )
        return;
      const files = transferFiles(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      receive(files);
    };
    const escape = (event) => {
      if (event.key === "Escape") cancel();
    };
    const end = () => {
      depth = 0;
      setDragging(false);
    };
    container?.addEventListener("dragenter", enter, true);
    container?.addEventListener("dragover", over, true);
    container?.addEventListener("dragleave", leave, true);
    container?.addEventListener("drop", drop, true);
    document.addEventListener("paste", paste, true);
    document.addEventListener("keydown", escape);
    document.addEventListener("dragend", end);
    return () => {
      cancel();
      insert.current = null;
      container?.removeEventListener("dragenter", enter, true);
      container?.removeEventListener("dragover", over, true);
      container?.removeEventListener("dragleave", leave, true);
      container?.removeEventListener("drop", drop, true);
      document.removeEventListener("paste", paste, true);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("dragend", end);
    };
  }, [containerRef, documentId, enabled]);

  if (!enabled || (!dragging && !processing)) return null;
  return (
    <div
      className={`image-component-overlay${processing ? " processing" : ""}`}
      role="status"
      aria-label={t("Вставка изображения")}
    >
      <div className="image-component-overlay-card">
        {processing ? (
          <RefreshCw size={32} className="saving-spinner" />
        ) : (
          <ImagePlus size={32} />
        )}
        <strong>
          {processing
            ? t("Добавляем картинку…")
            : t("Отпустите картинку, чтобы создать компонент")}
        </strong>
        <span>{t("JPG, JPEG, PNG, WebP · до 10 МБ")}</span>
        <small>{t("Esc — отменить")}</small>
      </div>
    </div>
  );
});
