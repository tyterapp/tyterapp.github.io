import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { t, useLanguage } from "./i18n.js";

const DISPLAY_MS = 5000;
const EXIT_MS = 200;

export function useAppMessage(initialValue = "") {
  const sequence = useRef(0);
  const [notice, setNotice] = useState(() =>
    initialValue ? { id: 0, value: initialValue } : null,
  );
  const setMessage = useCallback((value) => {
    setNotice(value ? { id: ++sequence.current, value } : null);
  }, []);
  const dismissMessage = useCallback((id) => {
    setNotice((current) => (current?.id === id ? null : current));
  }, []);
  return { notice, setMessage, dismissMessage };
}

export default function AppMessage({ notice, onDismiss }) {
  useLanguage();
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setClosing(true), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => onDismiss(notice.id), EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing, notice.id, onDismiss]);
  const value = notice.value;
  const action = typeof value === "object" ? value.action : null;
  return (
    <div className={`app-message${closing ? " is-closing" : ""}`} role="alert">
      <span>
        {typeof value === "object"
          ? t(value.key, ...(value.values || []))
          : t(value)}
      </span>
      {!action && (
        <button type="button" className="app-message-action" disabled={closing}>
          {t("Перейти")}
        </button>
      )}
      {action && (
        <a
          className="app-message-action"
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            if (action.desktopSupport && window.tyterDesktop?.openSupport) {
              event.preventDefault();
              window.tyterDesktop.openSupport(action.desktopSupport);
            }
          }}
        >
          {t(action.label)}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      )}
      <button
        className="icon-button"
        aria-label={t("Закрыть уведомление")}
        disabled={closing}
        onClick={() => setClosing(true)}
      >
        <X size={16} />
      </button>
    </div>
  );
}
