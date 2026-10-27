import { useEffect, useRef } from "react";
import { Delete } from "lucide-react";

export default function TelegraphDeleteButton({
  language,
  disabled,
  onDelete,
  onDeleteWord,
}) {
  const handlers = useRef({ onDelete, onDeleteWord });
  handlers.current = { onDelete, onDeleteWord };
  const gesture = useRef(null);
  const timer = useRef(null);
  const skipClick = useRef(false);
  const wordEnabled = !!onDeleteWord;
  const cancel = () => {
    clearTimeout(timer.current);
    if (gesture.current) skipClick.current = true;
    gesture.current = null;
  };
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancel();
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    cancel();
  }, [disabled, wordEnabled, language]);
  const en = language === "en";
  return (
    <button
      type="button"
      className="telegraph-delete-button"
      aria-label={en ? "Delete last character" : "Удалить последний символ"}
      title={
        wordEnabled
          ? en
            ? "Tap: delete a character. Hold: delete a word."
            : "Тап — удалить символ. Удержание — удалить слово."
          : en
            ? "Delete last character"
            : "Удалить последний символ"
      }
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.isPrimary === false) return;
        event.preventDefault();
        cancel();
        skipClick.current = false;
        if (!wordEnabled || !["touch", "pen"].includes(event.pointerType))
          return;
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* Detached pointer. */
        }
        timer.current = setTimeout(() => {
          if (!gesture.current) return;
          skipClick.current = true;
          handlers.current.onDeleteWord?.();
        }, 450);
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (
          current?.id === event.pointerId &&
          Math.hypot(event.clientX - current.x, event.clientY - current.y) > 12
        )
          cancel();
      }}
      onPointerUp={(event) => {
        if (gesture.current?.id !== event.pointerId) return;
        clearTimeout(timer.current);
        gesture.current = null;
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onContextMenu={(event) => {
        if (wordEnabled) event.preventDefault();
      }}
      onKeyDown={() => {
        skipClick.current = false;
      }}
      onClick={() => {
        if (skipClick.current) {
          skipClick.current = false;
          return;
        }
        handlers.current.onDelete?.();
      }}
    >
      <Delete size={19} aria-hidden="true" />
    </button>
  );
}
