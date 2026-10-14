import { useEffect, useRef, useState } from "react";
import { Check, Minus } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import SiteLayout, { ProLink } from "./SiteLayout.jsx";
import LandingPreview from "./LandingPreview.jsx";

const features = [
  [
    "Быстрое форматирование",
    "Используйте горячие клавиши или панель быстрого форматирования, чтобы быстрее структурировать ваш сценарий под стандарт индустрии.",
    "",
  ],
  [
    "Компоненты",
    "Создавайте компоненты для локаций, персонажей и других сущностей, чтобы они всегда были под рукой.",
    "Компоненты",
  ],
  [
    "Статистика",
    "Смотрите хронометраж, количество сцен, реплик и другие характеристики вашего сценария.",
    "Статистика",
  ],
  [
    "Аутлайн · Pro",
    "Создавайте карточки истории в актах, находите их поиском и переходите к связанным сценам. Текст карточек и сценария независим.",
    "Аутлайн · Pro",
  ],
  [
    "Реквизит",
    "Собирайте реквизит, учитывайте количество и создавайте отчёты в PDF, чтобы ничего не потерять на съёмках.",
    "Реквизит",
  ],
  [
    "История изменений",
    "Возвращайтесь к предыдущим версиям. Текст и детали истории сохраняются на вашем устройстве.",
    "История изменений",
  ],
  [
    "Файлы TYT · Pro",
    "Переносите весь проект одним файлом: сценарий, комментарии, реквизит, компоненты, аутлайн, обложку и историю изменений.",
    "Файлы TYT · Pro",
  ],
];
const comparison = [
  ["Документы", "2", "Без ограничений"],
  ["Компоненты в сценарии", "10", "Без ограничений"],
  ["История изменений", "14 дней", "Без ограничения срока"],
  ["Форматирование, поиск и комментарии", true, true],
  ["Экспорт PDF, DOCX и FDX", true, true],
  ["Аутлайн с карточками истории", false, true],
  ["Реквизит и отчёты PDF", false, true],
  ["Проект со всеми деталями в TYT", false, true],
];
function Availability({ value }) {
  return typeof value === "boolean" ? (
    <span
      className={value ? "plan-available" : "plan-unavailable"}
      aria-label={t(value ? "Доступно" : "Недоступно")}
    >
      {value ? (
        <Check size={18} aria-hidden="true" />
      ) : (
        <Minus size={18} aria-hidden="true" />
      )}
    </span>
  ) : (
    t(value)
  );
}
function Price({ alternate }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`site-price-wrap${visible ? " is-visible" : ""}`}>
      <div className="site-price-particles" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <i
            key={index}
            style={{
              "--particle-x": `${[7, 19, 38, 63, 81, 93, 3, 98, 13, 36, 68, 89][index]}%`,
              "--particle-y": `${[23, 5, 14, 7, 12, 28, 64, 68, 86, 94, 90, 86][index]}%`,
              "--particle-delay": `${-index * 0.31}s`,
            }}
          />
        ))}
      </div>
      <ProLink
        alternate={alternate}
        className="site-price"
        aria-label={t(
          alternate
            ? "Купить PRO за 600 ₽ в месяц"
            : "Купить PRO за 2000 ₽ в год",
        )}
      >
        <span className="site-price-label">TYTER PRO</span>
        <span className="site-price-value">
          {alternate ? "600" : "2000"} <span>₽</span>
        </span>
        <span className="site-price-period">
          {t(alternate ? "в месяц" : "в год")}
        </span>
      </ProLink>
    </div>
  );
}
export default function LandingPage({ alternate = false }) {
  useLanguage();
  return (
    <SiteLayout alternate={alternate}>
      {features.map(([title, description, panel], index) => (
        <section
          className="site-feature"
          key={title}
          aria-labelledby={`feature-${index}`}
        >
          <div className="site-feature-media">
            <LandingPreview panel={panel ? t(panel) : undefined} />
          </div>
          <div className="site-feature-copy">
            <h2 id={`feature-${index}`}>{t(title)}</h2>
            <p>{t(description)}</p>
          </div>
        </section>
      ))}
      <section className="site-comparison" aria-labelledby="plans-title">
        <div className="site-comparison-heading">
          <span className="site-eyebrow">FREE / PRO</span>
          <h2 id="plans-title">{t("Выберите свой ритм")}</h2>
          <p>
            {t(
              "Начните бесплатно. Выберите PRO, когда истории понадобится больше пространства.",
            )}
          </p>
        </div>
        <Price alternate={alternate} />
        <table className="site-plan-table">
          <caption>{t("Сравнение Free и PRO")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Возможности")}</th>
              <th scope="col">Free</th>
              <th scope="col">PRO</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map(([label, free, pro]) => (
              <tr key={label}>
                <th scope="row">{t(label)}</th>
                <td>
                  <Availability value={free} />
                </td>
                <td>
                  <Availability value={pro} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="site-comparison-actions">
          <a className="site-button black" href="/free">
            {t("Попробовать бесплатно")}
          </a>
          <ProLink alternate={alternate} />
        </div>
      </section>
    </SiteLayout>
  );
}
