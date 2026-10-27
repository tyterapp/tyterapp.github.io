import { getLanguage, setLanguage, t, useLanguage } from "./i18n.js";

export default function LanguageSwitch() {
  useLanguage();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label={t("Язык интерфейса")}
    >
      {[
        ["ru", "RU"],
        ["en", "ENG"],
      ].map(([language, label]) => (
        <button
          key={language}
          aria-pressed={getLanguage() === language}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setLanguage(language)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
