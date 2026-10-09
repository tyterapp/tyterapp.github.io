import { useState } from "react";
import { Stethoscope, X, CheckCircle2, ChevronRight } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import AppSelect from "./AppSelect.jsx";

export default function ScriptDoctor({ findings, onGo, onClose }) {
  useLanguage();
  const [filter, setFilter] = useState("all");
  const visible = findings.filter(
    (finding) => filter === "all" || finding.kind === filter,
  );
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
      <p className="doctor-summary">{t("Замечаний: {0}", findings.length)}</p>
      <div className="search-format-filter">
        <span>{t("Проверка")}</span>
        <AppSelect
          value={filter}
          onChange={setFilter}
          label={t("Проверка")}
          options={[
            ["all", "Все замечания"],
            ["headings", "Заголовки сцен"],
            ["duplicates", "Повторы"],
            ["dialogue", "Диалоги"],
          ].map(([value, label]) => ({ value, label: t(label) }))}
        />
      </div>
      <div className="doctor-results">
        {!findings.length && (
          <p className="doctor-clear">
            <CheckCircle2 size={24} />
            {t("Замечаний не найдено")}
          </p>
        )}
        {!!findings.length && !visible.length && (
          <p className="doctor-clear">{t("В этой категории замечаний нет")}</p>
        )}
        {visible.map((finding) => (
          <button
            className="doctor-finding"
            key={finding.id}
            onClick={() => onGo(finding)}
          >
            {finding.sceneId && (
              <span className="doctor-scene-label">
                {t(
                  "Сцена {0} · вариант {1}",
                  finding.sceneNumber,
                  finding.variant,
                )}
              </span>
            )}
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
