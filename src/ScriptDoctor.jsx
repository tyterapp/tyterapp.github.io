import { useMemo, useState } from "react";
import { Stethoscope, X, CheckCircle2, ChevronRight } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { inspectScript } from "./script-doctor.js";

export default function ScriptDoctor({ content, onGo, onClose }) {
  useLanguage();
  const [filter, setFilter] = useState("all");
  const findings = useMemo(() => inspectScript(content), [content]);
  return (
    <aside className="doctor-drawer" aria-label={t("Доктор сценария")}>
      <div className="drawer-heading">
        <h2>
          <Stethoscope size={17} />
          {t("Доктор сценария")}
        </h2>
        <button
          className="icon-button"
          aria-label={t("Закрыть доктора сценария")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p className="settings-hint">
        {t(
          "Заголовки, повторы и диалоги. Нажмите на замечание, чтобы перейти к тексту.",
        )}
      </p>
      <label className="search-format-filter">
        <span>{t("Проверка")}</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {[
            ["all", "Все замечания"],
            ["headings", "Заголовки сцен"],
            ["duplicates", "Повторы"],
            ["dialogue", "Диалоги"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
      </label>
      <div className="doctor-results">
        {!findings.length && (
          <p className="doctor-clear">
            <CheckCircle2 size={24} />
            {t("Замечаний не найдено")}
          </p>
        )}
        {findings
          .filter((finding) => filter === "all" || finding.kind === filter)
          .map((finding) => (
            <button
              className="doctor-finding"
              key={finding.id}
              onClick={() => onGo(finding.blockId)}
            >
              <strong>
                {t(finding.title)}
                <ChevronRight size={15} />
              </strong>
              <span>
                {finding.detail.includes("|")
                  ? t(...finding.detail.split("|"))
                  : t(finding.detail)}
              </span>
              <small>{finding.quote}</small>
            </button>
          ))}
      </div>
    </aside>
  );
}
