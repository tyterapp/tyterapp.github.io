import { t, useLanguage, languageLocale } from "./i18n.js";
export default function NotFoundPage() {
  const language = useLanguage();
  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label={t("Tyter — главная")}>
          <img src="/brand/tyter-logo.svg" alt="" />
          Tyter
        </a>
        <a className="landing-button black" href="/free">
          {t("Бесплатная версия")}
        </a>
      </header>
      <main className="landing-hero">
        <h1>404</h1>
        <h2>{t("Страница не найдена")}</h2>
        <p>{t("Проверьте адрес или вернитесь к своей истории.")}</p>
        <div className="landing-download-buttons">
          <a className="landing-button black" href="/">
            {t("На главную")}
          </a>
          <a className="landing-button purple" href="/pro">
            {t("Открыть PRO")}
          </a>
        </div>
      </main>
    </div>
  );
}
