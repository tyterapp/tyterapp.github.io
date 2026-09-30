import { useEffect, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { listRevisions } from "./history.js";
import { useEdition } from "./edition.js";

const preview = (revision) =>
  (revision.snapshot.content?.content || [])
    .flatMap((block) => (block.content || []).map((part) => part.text || ""))
    .join(" ")
    .trim()
    .slice(0, 180) || "Пустой сценарий";

export default function HistoryPanel({
  documentId,
  version,
  selectedId,
  onSelect,
  onRestore,
  onClose,
}) {
  const { isPro: IS_PRO, historyDays: HISTORY_DAYS } = useEdition();
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    listRevisions(documentId, HISTORY_DAYS)
      .then((rows) => {
        if (!cancelled) {
          setEntries(rows);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось открыть локальную историю.");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, version, HISTORY_DAYS]);

  return (
    <aside className="history-drawer" aria-label="История изменений">
      <div className="drawer-heading">
        <h2>История изменений</h2>
        <button
          className="icon-button"
          aria-label="Закрыть историю"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p className="history-intro">
        {IS_PRO ? "Все версии сохраняются на этом устройстве без ограничения срока." : `Версии за последние ${HISTORY_DAYS} дней сохраняются на этом устройстве.`}
      </p>
      <div className="history-scroll">
        <div className="history-current">
          <History size={16} /> Текущая версия
        </div>
        {error && (
          <p role="alert" className="sidebar-empty">
            {error}
          </p>
        )}
        {!error && !entries.length && (
          <p className="sidebar-empty">
            После первого изменения здесь появится предыдущая версия сценария.
          </p>
        )}
        {entries.map((entry) => (
          <div className="history-entry" key={entry.id}>
            <button
              className={`history-card${selectedId === entry.id ? " selected" : ""}`}
              aria-expanded={selectedId === entry.id}
              onClick={() => onSelect(selectedId === entry.id ? null : entry)}
            >
              <time dateTime={new Date(entry.createdAt).toISOString()}>
                {new Date(entry.createdAt).toLocaleString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <strong>
                {entry.label === "восстановления"
                  ? "До восстановления"
                  : `До изменения ${entry.label}`}
              </strong>
              <span>{preview(entry)}</span>
            </button>
            {selectedId === entry.id && (
              <div className="history-entry-actions">
                <button
                  className="quiet-button"
                  onClick={() => onRestore(entry)}
                >
                  <RotateCcw size={15} /> Восстановить эту версию
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!IS_PRO && (
        <p className="history-upgrade">
          В полной версии история хранится без ограничения срока.
        </p>
      )}
    </aside>
  );
}
