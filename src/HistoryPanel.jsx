import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useState } from "react";
import { History, RotateCcw, Trash2, X } from "lucide-react";
import { localDay } from "./daily-streak.js";
import "./deletion-history.css";
import { listRevisions, revisionArea } from "./history.js";
import { useEdition } from "./edition.js";
import { scriptVersionId } from "./script-versions.js";
const preview = (revision, notes = false) =>
  revisionArea(revision) === "outline"
    ? (revision.snapshot.outline?.cards || [])
        .map((card) => `${card.title || t("Без названия")}: ${card.text || ""}`)
        .join(" · ")
        .slice(0, 180) || t("Пустой аутлайн")
    : (
        (notes ? revision.snapshot.notes?.content : revision.snapshot.content)
          ?.content || []
      )
        .flatMap((block) =>
          (block.content || []).map((part) => part.text || ""),
        )
        .join(" ")
        .trim()
        .slice(0, 180) || t("Пустой сценарий");
export default function HistoryPanel({
  documentId,
  scriptVersion = "white",
  notes = false,
  version,
  selectedId,
  deletions = [],
  achievements = [],
  onSelect,
  onRestore,
  onClose,
}) {
  const language = useLanguage();
  const { isPro: IS_PRO, historyDays: HISTORY_DAYS } = useEdition();
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const today = localDay();
  const dailyDeletions = deletions.filter(
    (entry) => entry.documentId === documentId && entry.date === today,
  );
  const scavenger = achievements.find((entry) => entry.id === "scavenger");
  const visibleEntries = entries.filter((entry) =>
    notes
      ? revisionArea(entry) === "notes" ||
        (revisionArea(entry) === "screenplay" && entry.label?.includes("замет"))
      : scriptVersionId(entry.snapshot) === scriptVersion &&
        revisionArea(entry) !== "notes" &&
        (IS_PRO || revisionArea(entry) === "screenplay"),
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
        aria-label={t("История изменений")}
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
            {t("документа")}.
          </p>
        )}
        {visibleEntries.map((entry) => (
          <div className="history-entry" key={entry.id}>
            <button
              className={`history-card${selectedId === entry.id ? " selected" : ""}`}
              aria-expanded={selectedId === entry.id}
              onClick={() => onSelect(selectedId === entry.id ? null : entry)}
            >
              <span className="history-area-badge">
                {t(
                  notes
                    ? "Заметки"
                    : revisionArea(entry) === "outline"
                      ? "Аутлайн"
                      : "Сценарий",
                )}
              </span>
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
              <span>{preview(entry, notes)}</span>
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
        <section
          className="history-deletions"
          aria-label={t("Удалённые копии за сегодня")}
        >
          <div className="history-deletions-heading">
            <Trash2 size={17} aria-hidden="true" />
            <h3>{t("Удалённые копии за сегодня")}</h3>
            <span>{dailyDeletions.length}</span>
          </div>
          {scavenger && (
            <p className="history-achievement">
              {t("Ачивка «Мусорщик»")} <span>+10 coins</span>
            </p>
          )}
          {dailyDeletions.length ? (
            <ul>
              {dailyDeletions.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.label}</span>
                  {entry.deletedAt && (
                    <time dateTime={new Date(entry.deletedAt).toISOString()}>
                      {new Date(entry.deletedAt).toLocaleTimeString(
                        languageLocale(),
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </time>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="history-deletions-empty">
              {t("Сегодня копии не удалялись.")}
            </p>
          )}
        </section>
      </div>
      {!IS_PRO && (
        <p className="history-upgrade">
          {t("В полной версии история хранится без ограничения срока.")}
        </p>
      )}
    </aside>
  );
}
