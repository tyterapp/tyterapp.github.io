import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Moon, Send, Sun } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import LanguageSwitch from "./LanguageSwitch.jsx";
import { useEditorPreferences } from "./editor-preferences.js";
import { loadCasePage } from "./case-loader.js";
import BrandContextMenu from "./BrandContextMenu.jsx";

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
  titleContent,
  description,
  children,
  feedRef,
  feedLabel,
  legalSection,
}) {
  const language = useLanguage();
  const [preferences, updatePreferences] = useEditorPreferences();
  const dark = preferences.theme === "dark";
  const [brandMenu, setBrandMenu] = useState(null);
  const closeBrandMenu = useCallback(() => setBrandMenu(null), []);
  useEffect(() => {
    document.title =
      page === "product"
        ? t("Tyter — редактор киносценариев")
        : `${title} — Tyter`;
  }, [language, title, page]);
  return (
    <div className={`site-shell${page === "product" ? " site-landing" : ""}`}>
      {brandMenu && (
        <BrandContextMenu
          position={brandMenu}
          onClose={closeBrandMenu}
          items={[
            ["/design", "Дизайн"],
            ["/case", "Кейс", () => loadCasePage().catch(() => {})],
          ]}
        />
      )}
      <aside className="site-fixed">
        <header className="site-nav">
          <a
            className={`site-logo${page === "product" ? " is-landing-logo" : ""}`}
            href="/"
            aria-label={t("Tyter — главная")}
            onContextMenu={(event) => {
              event.preventDefault();
              setBrandMenu({ left: event.clientX, top: event.clientY });
            }}
            onKeyDown={(event) => {
              if (
                event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10")
              ) {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setBrandMenu({ left: rect.left, top: rect.bottom });
              }
            }}
          >
            <img
              src={
                page === "product"
                  ? "/dildamode/brand/landing-logo.svg"
                  : "/dildamode/brand/tyter-logo.svg"
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
                onPointerEnter={
                  id === "case"
                    ? () => {
                        loadCasePage().catch(() => {});
                      }
                    : undefined
                }
                onFocus={
                  id === "case"
                    ? () => {
                        loadCasePage().catch(() => {});
                      }
                    : undefined
                }
                aria-current={page === id ? "page" : undefined}
              >
                {t(label)}
              </a>
            ))}
          </nav>
        </header>
        <section className="site-intro">
          {titleContent || <h1>{title || t("Сценарий без хаоса")}</h1>}
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
            <span className="site-credit-author">
              {language === "en"
                ? "Made by Sergey Buharev"
                : "Сделал Сергей Бухарев"}{" "}
              <a
                className="site-copyright"
                href="/license"
                aria-label={
                  language === "en"
                    ? "Application license and user agreement"
                    : "Лицензия приложения и пользовательское соглашение"
                }
              >
                ©
              </a>{" "}
              2026
            </span>
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
        {(page === "product" || page === "legal") && (
          <nav
            className="site-legal-switch"
            aria-label={
              language === "en" ? "Legal documents" : "Правовые документы"
            }
          >
            <span>
              {[
                ["license", "Лицензия", "License"],
                ["agreement", "Пользовательское соглашение", "User agreement"],
              ].map(([id, ru, en]) => (
                <a
                  key={id}
                  href={page === "legal" ? `#${id}` : `/license#${id}`}
                  aria-current={legalSection === id ? "page" : undefined}
                >
                  {language === "en" ? en : ru}
                </a>
              ))}
            </span>
          </nav>
        )}
        {children}
      </main>
    </div>
  );
}
