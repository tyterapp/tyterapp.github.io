import { t, useLanguage } from "./i18n.js";
import SiteLayout from "./SiteLayout.jsx";
export default function NotFoundPage() {
  useLanguage();
  return (
    <SiteLayout
      page="missing"
      title="404"
      description={t("Проверьте адрес или вернитесь к своей истории.")}
      feedLabel={t("Страница не найдена")}
    >
      <section className="site-notfound-content">
        <h2>{t("Страница не найдена")}</h2>
        <div className="site-actions">
          <a className="site-button black" href="/">
            {t("На главную")}
          </a>
          <a className="site-button black" href="/free">
            {t("Бесплатная версия")}
          </a>
          <a className="site-button purple" href="/beta">
            {t("Открыть PRO")}
          </a>
        </div>
      </section>
    </SiteLayout>
  );
}
