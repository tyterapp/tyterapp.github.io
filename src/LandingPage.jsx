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
  [
    "Проекты и сохранение",
    [
      ["Документы", "2", "Без ограничений"],
      ["Локальное автосохранение и работа без интернета", true, true],
      ["Девять цветных версий и копии сценария", true, true],
      ["Отдельные поиск, компоненты и история каждой версии", true, true],
      [
        "История изменений и восстановление версий",
        "14 дней",
        "Без ограничения срока",
      ],
      ["Полный проект TYT: импорт, экспорт и резервные копии", false, true],
      ["Автосохранение TYT в выбранную папку в Chrome / Edge", false, true],
    ],
  ],
  [
    "Текст и редактор",
    [
      [
        "Сцены, действия, персонажи, реплики, ремарки, переходы и обычный текст",
        true,
        true,
      ],
      ["Горячие клавиши и нижняя панель форматирования", true, true],
      ["Жирный, курсив, подчёркивание и вставка с форматированием", true, true],
      ["Подсказки сцен, времени суток и компонентов", true, true],
      ["Варианты сцен A–F и переключение между ними", true, true],
      ["Поиск по тексту и типу абзаца с переходом к результату", true, true],
      ["Комментарии, ответы и отметки о решении", true, true],
      ["Проверка орфографии на русском и английском", true, true],
      ["Шрифты, размер текста и масштаб документа", true, true],
      ["Режим фокуса и чтение реплик персонажа", true, true],
      ["Звуки клавиш печатной машинки", true, true],
      ["Мобильный интерфейс с шторками и учётом клавиатуры", true, true],
      ["Светлая и тёмная темы, русский и английский интерфейс", true, true],
    ],
  ],
  [
    "История и подготовка к съёмкам",
    [
      ["Компоненты в сценарии", "10", "Без ограничений"],
      [
        "Персонажи, локации, описания, изображения и папки компонентов",
        true,
        true,
      ],
      [
        "Подключение библиотек компонентов",
        "В пределах 10 компонентов",
        "Без ограничений",
      ],
      ["Статистика текста, сцен, персонажей, реплик и хронометраж", true, true],
      [
        "Свойства кадра: формат, оптика, план, ракурс, композиция и свет",
        true,
        true,
      ],
      ["Загрузка кадра, миниатюра и кадрирование по формату", true, true],
      ["Название шота с номером и вариантом сцены", true, true],
      ["Время суток, люди в кадре и автоматический хронометраж", true, true],
      ["Дата съёмки и локация на карте с координатами", true, true],
      ["Состав сцены с переходом к тексту и отчёт по кадрам в PDF", true, true],
      ["Аутлайн: акты, карточки, поиск и связь со сценами", false, true],
      ["Цвета этапов производства и график драматичности", false, true],
      ["Реквизит, папки, количество, связи с текстом и отчёт PDF", false, true],
    ],
  ],
  [
    "Импорт и экспорт",
    [
      ["Импорт PDF, DOCX и FDX", true, true],
      ["Экспорт PDF, DOCX и FDX", true, true],
      ["Авторство, обложка и титульный лист", true, true],
      ["Нумерация сцен и буквы вариантов в экспорте", true, true],
    ],
  ],
  [
    "Монеты и магазин",
    [
      ["Таймеры письма и монеты за завершённые минуты", true, true],
      ["10 монет за каждые 100 написанных символов", true, true],
      ["Ежедневная монета, стрики и бонус за каждые 5 дней подряд", true, true],
      ["Достижения", true, true],
      [
        "Доктор сценария: проверка формата и отключаемые мухи",
        "20 монет",
        "20 монет",
      ],
      [
        "Домик oiia, увеличение, снимок PNG и ссылка на снимок",
        "100 монет",
        "100 монет",
      ],
      [
        "Зажигалка: многократное сжигание последней страницы",
        "50 монет",
        "50 монет",
      ],
      [
        "Рация: микрофон и диктовка текста в сценарий",
        "100 монет",
        "100 монет",
      ],
      ["Сброс монет, покупок и достижений", "200 монет", "200 монет"],
    ],
  ],
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
          {comparison.map(([group, rows]) => (
            <tbody key={group}>
              <tr className="site-plan-group">
                <th colSpan="3" scope="rowgroup">
                  {t(group)}
                </th>
              </tr>
              {rows.map(([label, free, pro]) => (
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
          ))}
        </table>
        <p className="site-plan-note">
          {t(
            "Монеты зарабатываются в редакторе. Покупки за монеты доступны в обоих тарифах. Скины, декор и локации пока представлены как анонсы. Для первого запуска офлайн-режима откройте редактор с интернетом; карта требует подключения.",
          )}
        </p>
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
