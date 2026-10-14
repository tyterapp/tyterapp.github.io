import { useEffect } from "react";
import { ExternalLink, Moon, Send, Sun } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import LanguageSwitch from "./LanguageSwitch.jsx";
import { useEditorPreferences } from "./editor-preferences.js";

export const BOOSTY_URL = "https://boosty.to/sergeybuharev";
export function ProLink({
  alternate = false,
  children,
  className = "site-button purple",
  ...props
}) {
  return (
    <a
      href={alternate ? BOOSTY_URL : "/pro"}
      className={className}
      {...(alternate ? { target: "_blank", rel: "noreferrer" } : {})}
      {...props}
    >
      {children || (
        <>
          {t("Купить PRO")}
          <ExternalLink size={22} aria-hidden="true" />
        </>
      )}
    </a>
  );
}

export default function SiteLayout({
  page = "product",
  alternate = false,
  title,
  description,
  children,
  feedRef,
  feedLabel,
}) {
  const language = useLanguage();
  const [preferences, updatePreferences] = useEditorPreferences();
  const dark = preferences.theme === "dark";
  useEffect(() => {
    document.title =
      page === "product"
        ? t("Tyter — редактор киносценариев")
        : `${title} — Tyter`;
  }, [language, title, page]);
  return (
    <div className={`site-shell${page === "product" ? " site-landing" : ""}`}>
      <aside className="site-fixed">
        <header className="site-nav">
          <a
            className={`site-logo${page === "product" ? " is-landing-logo" : ""}`}
            href="/"
            aria-label={t("Tyter — главная")}
          >
            <img
              src={
                page === "product"
                  ? "/brand/landing-logo.svg"
                  : "/brand/tyter-logo.svg"
              }
              alt=""
              width="64"
              height="64"
            />
          </a>
          <nav aria-label={t("Основная навигация")}>
            {[
              ["product", "/", "Продукт"],
              ["blog", "/blog", "Блог"],
              ["help", "/help", "Помощь"],
            ].map(([id, href, label]) => (
              <a
                key={id}
                href={href}
                aria-current={page === id ? "page" : undefined}
              >
                {t(label)}
              </a>
            ))}
          </nav>
        </header>
        <section className="site-intro">
          <h1>{title || t("Сценарий без хаоса")}</h1>
          <p>
            {description ||
              t(
                "Tyter помогает организовать сцены, карточки и детали истории, чтобы вы могли сосредоточиться на тексте.",
              )}
          </p>
          {page !== "missing" && (
            <div className="site-actions">
              <a className="site-button black" href="/free">
                {t("Попробовать бесплатно")}
              </a>
              <ProLink alternate={alternate} />
            </div>
          )}
        </section>
        <footer className="site-footer">
          <div className="site-controls">
            <LanguageSwitch />
            <button
              className="site-theme"
              type="button"
              onClick={() =>
                updatePreferences({ theme: dark ? "light" : "dark" })
              }
              aria-label={t(
                dark ? "Включить светлую тему" : "Включить тёмную тему",
              )}
              aria-pressed={dark}
            >
              <Sun
                className={`site-theme-icon${dark ? " is-visible" : ""}`}
                size={22}
                aria-hidden="true"
              />
              <Moon
                className={`site-theme-icon${!dark ? " is-visible" : ""}`}
                size={22}
                aria-hidden="true"
              />
            </button>
          </div>
          <div className="site-credits">
            <span>{t("Сделал Сергей Бухарев в 2026")}</span>
            <a
              href="https://t.me/ultraproduct"
              target="_blank"
              rel="noreferrer"
            >
              {t("Чат бета-тестеров в Телеграме")}
              <Send size={18} aria-hidden="true" />
            </a>
          </div>
        </footer>
      </aside>
      <main
        ref={feedRef}
        className="site-feed"
        tabIndex={0}
        aria-label={feedLabel || t("Функции Tyter")}
      >
        {children}
      </main>
    </div>
  );
}
