import SiteLayout from "./SiteLayout.jsx";
import { useLanguage } from "./i18n.js";
import "./case-page.css";

export default function CaseLoading() {
  const english = useLanguage() === "en";
  return (
    <SiteLayout
      page="case"
      title={english ? "From a line to a frame" : "От строки к кадру"}
      description={
        english
          ? "The making of Tyter. A product case study."
          : "Как создавался Tyter. Продуктовый кейс."
      }
    >
      <div
        className="case-loading"
        aria-busy="true"
        role="status"
        aria-label={english ? "Loading case study" : "Загрузка кейса"}
      >
        <span className="case-skeleton case-skeleton-tag" />
        <span className="case-skeleton case-skeleton-title" />
        <span className="case-skeleton case-skeleton-line" />
        <span className="case-skeleton case-skeleton-line" />
        <span className="case-skeleton case-skeleton-media" />
      </div>
    </SiteLayout>
  );
}
