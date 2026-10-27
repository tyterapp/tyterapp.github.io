import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import EditorFirstVisit from "./EditorFirstVisit.jsx";
import KeyboardShortcuts from "./KeyboardShortcuts.jsx";

export default function EditorLearning({ onBack }) {
  const language = useLanguage();
  const [tab, setTab] = useState("greeting");
  return (
    <main className="learning-workspace" aria-label={t("Документ обучения")}>
      <article className="learning-paper">
        <header className="learning-header">
          <div
            className="help-tabs learning-tabs"
            role="tablist"
            aria-label={t("Раздел помощи")}
          >
            {[
              ["greeting", t("Привет!")],
              ["shortcuts", t("Горячие клавиши")],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                id={`learning-tab-${id}`}
                role="tab"
                aria-selected={tab === id}
                aria-controls={`learning-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? "greeting"
                      : event.key === "End"
                        ? "shortcuts"
                        : tab === "greeting"
                          ? "shortcuts"
                          : "greeting";
                  setTab(next);
                  document.getElementById(`learning-tab-${next}`)?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="learning-back" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("Вернуться к сценарию")}
          </button>
        </header>
        <div
          className="learning-content"
          id={`learning-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`learning-tab-${tab}`}
          tabIndex={0}
        >
          {tab === "greeting" ? (
            <EditorFirstVisit key={language} />
          ) : (
            <KeyboardShortcuts />
          )}
        </div>
      </article>
    </main>
  );
}
