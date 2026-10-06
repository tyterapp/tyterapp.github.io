import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { listRevisions, revisionArea } from "./history.js";
import { useEdition } from "./edition.js";
const preview = (revision) =>
  revisionArea(revision) === "outline"
    ? (revision.snapshot.outline?.cards || [])
        .map((card) => `${card.title || t("Без названия")}: ${card.text || ""}`)
        .join(" · ")
        .slice(0, 180) || t("Пустой аутлайн")
    : (revision.snapshot.content?.content || [])
        .flatMap((block) =>
          (block.content || []).map((part) => part.text || ""),
        )
        .join(" ")
        .trim()
        .slice(0, 180) || t("Пустой сценарий");
export default function HistoryPanel({
  documentId,
  version,
  area = "screenplay",
  onArea,
  selectedId,
  onSelect,
  onRestore,
  onClose,
}) {
  const language = useLanguage();
  const { isPro: IS_PRO, historyDays: HISTORY_DAYS } = useEdition();
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const visibleEntries = entries.filter(
    (entry) => revisionArea(entry) === area,
  );
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
    <aside className="history-drawer" aria-label={t("История изменений")}>
      <div className="drawer-heading">
        <h2>{t("История изменений")}</h2>
        <button
          className="icon-button"
          aria-label={t("Закрыть историю")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div
        className="history-tabs"
        role="tablist"
        aria-label={t("Раздел истории")}
      >
        <button
          role="tab"
          aria-selected={area === "screenplay"}
          aria-controls="history-revisions"
          onClick={() => onArea("screenplay")}
        >
          {t("Сценарий")}
        </button>
        <button
          role="tab"
          aria-selected={area === "outline"}
          aria-controls="history-revisions"
          disabled={!IS_PRO}
          onClick={() => onArea("outline")}
        >
          {t("Аутлайн")}
        </button>
      </div>
      <p className="history-intro">
        {IS_PRO
          ? t(
              "Все версии сохраняются на этом устройстве без ограничения срока.",
            )
          : t(
              "Версии за последние {0} дней сохраняются на этом устройстве.",
              HISTORY_DAYS,
            )}
      </p>
      <div
        className="history-scroll"
        id="history-revisions"
        role="tabpanel"
        aria-label={
          area === "outline" ? t("История аутлайна") : t("История сценария")
        }
      >
        <div className="history-current">
          <History size={16} />
          {t(" Текущая версия")}
        </div>
        {error && (
          <p role="alert" className="sidebar-empty">
            {t(error)}
          </p>
        )}
        {!error && !visibleEntries.length && (
          <p className="sidebar-empty">
            {t("После первого изменения здесь появится предыдущая версия")}{" "}
            {area === "outline" ? t("аутлайна") : t("сценария")}.
          </p>
        )}
        {visibleEntries.map((entry) => (
          <div className="history-entry" key={entry.id}>
            <button
              className={`history-card${selectedId === entry.id ? " selected" : ""}`}
              aria-expanded={selectedId === entry.id}
              onClick={() => onSelect(selectedId === entry.id ? null : entry)}
            >
              <time dateTime={new Date(entry.createdAt).toISOString()}>
                {new Date(entry.createdAt).toLocaleString(languageLocale(), {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <strong>
                {entry.label === "восстановления"
                  ? t("До восстановления")
                  : t(
                      "До изменения {0}",
                      entry.label
                        .split(", ")
                        .map((label) => t(label))
                        .join(", "),
                    )}
              </strong>
              <span>{preview(entry)}</span>
            </button>
            {selectedId === entry.id && (
              <div className="history-entry-actions">
                <button
                  className="quiet-button"
                  onClick={() => onRestore(entry)}
                >
                  <RotateCcw size={15} />
                  {t(" Восстановить эту версию")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!IS_PRO && (
        <p className="history-upgrade">
          {t("В полной версии история хранится без ограничения срока.")}
        </p>
      )}
    </aside>
  );
}
