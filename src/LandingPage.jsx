import { t, useLanguage, languageLocale } from "./i18n.js";
import LanguageSwitch from "./LanguageSwitch.jsx";
import { useEffect } from "react";
import {
  Download,
  Search,
  Shapes,
  ChartNoAxesColumn,
  Box,
  Settings2,
  History,
  ArrowRight,
  FolderOpen,
} from "lucide-react";
const donate = "https://boosty.to/sergeybuharev";
function Preview({ panel }) {
  const language = useLanguage();
  if (panel === t("Аутлайн · Pro"))
    return (
      <div
        className="landing-outline-preview"
        aria-label={t("Карточки аутлайна")}
      >
        {[t("Завязка"), t("Развитие"), t("Развязка")].map((act, index) => (
          <section key={act}>
            <strong>
              {t("Акт ")}
              {index + 1}
            </strong>
            {[
              act,
              [t("Незваный гость"), t("Поиски ответа"), t("Возвращение домой")][
                index
              ],
            ].map((title, cardIndex) => (
              <article key={t(title)}>
                <strong
                  style={{
                    color: cardIndex ? "#37343d" : "#1b2eff",
                  }}
                >
                  ▣ {t(title)}
                </strong>
                <p>
                  {
                    [
                      t(
                        "Кошка замечает открытое окно. На улице начинается новая история.",
                      ),
                      t(
                        "Анна ищет кошку в городе и встречает того, кто знает дорогу.",
                      ),
                      t(
                        "Квартира снова полна света. Кошка возвращается домой.",
                      ),
                    ][index]
                  }
                </p>
              </article>
            ))}
          </section>
        ))}
      </div>
    );
  if (panel === t("Файлы TYT · Pro"))
    return (
      <div
        className="landing-tyt-preview"
        aria-label={t("Проект Tyter в одном файле")}
      >
        <div className="landing-tyt-file">
          <FolderOpen size={38} />
          <strong>{t("Глазами кошки.tyt")}</strong>
          <span>{t("Вся история в одном файле")}</span>
        </div>
        <div className="landing-tyt-items">
          {[
            t("Сценарий"),
            t("Аутлайн"),
            t("Комментарии"),
            t("Компоненты"),
            t("Реквизит"),
            t("Обложка и авторство"),
          ].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    );
  return (
    <div
      className={`landing-preview ${panel ? "with-panel" : ""}`}
      aria-label={
        panel
          ? t("Предпросмотр: {0}", panel)
          : t("Предпросмотр редактора Tyter")
      }
    >
      <div className="preview-top">
        <span>
          <img src="/brand/tyter-logo.svg" alt="" />
          {t("Глазами кошки ")}
          <small>⌄</small>
          <FolderOpen size={13} />
        </span>
        <span>
          {[
            Search,
            ChartNoAxesColumn,
            Shapes,
            Box,
            Settings2,
            History,
            Download,
          ].map((Icon, i) => (
            <Icon key={i} size={13} />
          ))}
        </span>
      </div>
      <div className="preview-workspace">
        <div className="preview-paper">
          <small className="preview-number">1</small>
          <b>{t("ИНТ. КВАРТИРА — УТРО")}</b>
          <p>
            {t(
              "Кошка наблюдает за городом с подоконника. Внизу спешат люди, а на кухне тихо звенит пустая миска.",
            )}
          </p>
          <div className="preview-dialogue">
            <b>{t("КОШКА")}</b>
            <br />
            {t("Кажется, у них опять свои планы на завтрак.")}
          </div>
          <b>{t("ИНТ. КВАРТИРА — ДЕНЬ")}</b>
          <p>
            <span
              className={
                panel === t("Реквизит") ? "preview-orange" : "preview-blue"
              }
            >
              {t("Миска")}
            </span>{" "}
            {t("всё ещё пуста. Анна открывает дверь.")}
          </p>
        </div>
        {panel && (
          <aside className="preview-panel">
            <strong>{panel}</strong>
            {panel === t("Компоненты") ? (
              <>
                <small>{t("Персонажи")}</small>
                <div>
                  {t("♧ Анна ")}
                  <small>{t("Главная героиня")}</small>
                </div>
                <div>
                  {t("♧ Кошка ")}
                  <small>{t("Внимательный наблюдатель")}</small>
                </div>
                <small>{t("Места")}</small>
                <div>{t("♧ Квартира")}</div>
              </>
            ) : panel === t("Статистика") ? (
              <>
                <div className="preview-metrics">
                  <b>
                    12<small>{t("страниц")}</small>
                  </b>
                  <b>
                    {t("12 мин")}
                    <small>{t("хронометраж")}</small>
                  </b>
                  <b>
                    8<small>{t("сцен")}</small>
                  </b>
                  <b>
                    24<small>{t("реплики")}</small>
                  </b>
                </div>
                <small>{t("Доля диалогов")}</small>
                <div className="preview-chart">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <small>
                  {t("Кошка · 14 реплик")}
                  <br />
                  {t("Анна · 10 реплик")}
                </small>
              </>
            ) : panel === t("Реквизит") ? (
              <>
                <div>
                  {t("▧ Миска ")}
                  <small>{t("1 шт. · В тексте: 3")}</small>
                </div>
                <div>
                  {t("▧ Ключи ")}
                  <small>{t("1 шт. · В тексте: 2")}</small>
                </div>
                <div>
                  {t("▧ Телефон ")}
                  <small>{t("1 шт. · В тексте: 4")}</small>
                </div>
                <span className="preview-report">{t("↓ Отчёт в PDF")}</span>
              </>
            ) : (
              <>
                <div>
                  {t("Сегодня, 12:42")}
                  <small>{t("Изменён текст сценария")}</small>
                </div>
                <div>
                  {t("Сегодня, 12:30")}
                  <small>{t("Добавлен компонент «Анна»")}</small>
                </div>
                <div>
                  {t("Вчера, 18:15")}
                  <small>{t("Первая сцена")}</small>
                </div>
                <small>{t("История хранится на устройстве")}</small>
              </>
            )}
          </aside>
        )}
      </div>
      <div className="preview-format-bar">
        {[
          "scene",
          "action",
          "character",
          "speech",
          "parenthetical",
          "transition",
          "plain",
          "comments",
        ].map((key, i) => (
          <span className={i === 0 ? "active" : ""} key={key}>
            <img src={`/icons/format/${key}.svg`} alt="" />
          </span>
        ))}
      </div>
    </div>
  );
}
const features = [
  [
    "Компоненты",
    "Создавайте компоненты для локаций, персонажей и других сущностей, чтобы они всегда были под рукой.",
  ],
  [
    "Статистика",
    "Смотрите хронометраж, количество сцен, реплик и другие характеристики вашего сценария.",
  ],
  [
    "Реквизит",
    "Собирайте реквизит, учитывайте количество и создавайте отчёты в PDF, чтобы ничего не потерять на съёмках.",
  ],
  [
    "История изменений",
    "Возвращайтесь к предыдущим версиям. Текст и детали истории сохраняются на вашем устройстве.",
  ],
  [
    "Аутлайн · Pro",
    "Создавайте карточки истории в актах, находите их поиском и переходите к связанным сценам. Текст карточек и сценария независим.",
  ],
  [
    "Файлы TYT · Pro",
    "Переносите весь проект одним файлом: сценарий, комментарии, реквизит, компоненты, аутлайн, обложку и историю изменений.",
  ],
];
export default function LandingPage() {
  const language = useLanguage();
  useEffect(() => {
    document.title = t("Tyter — редактор киносценариев");
  }, [language]);
  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label={t("Tyter — главная")}>
          <img src="/brand/tyter-logo.svg" alt="" />
          Tyter
        </a>
        <nav aria-label={t("Основная навигация")}>
          <a href="#features">{t("Продукт")}</a>
          <a href="#pro">Pro</a>
          <a href="#help">{t("Помощь")}</a>
        </nav>
        <a className="landing-button black" href="/free">
          {t("Попробовать")}
        </a>
        <a className="landing-button purple" href="#pro">
          {t("Купить PRO")}
        </a>
        <LanguageSwitch />
      </header>
      <main>
        <section className="landing-hero">
          <h1>{t("Сценарий без хаоса")}</h1>
          <p>
            {t(
              "Tyter помогает сценаристам быстрее собирать сцены, структуру и детали проекта.",
            )}
          </p>
          <Preview />
        </section>
        <div id="features">
          {features.map(([title, description]) => (
            <section className="landing-feature" key={title}>
              <h2>{t(title)}</h2>
              <p>{t(description)}</p>
              <Preview panel={t(title)} />
            </section>
          ))}
        </div>
        <section className="landing-editions" id="pro">
          <h2>{t("Выберите свой ритм")}</h2>
          <div className="landing-plan-grid">
            <article>
              <span className="plan-label">{t("В браузере")}</span>
              <h3>{t("Пробная версия")}</h3>
              <p>{t("Для знакомства с редактором, бесплатно.")}</p>
              <ul>
                <li>{t("2 документа и 10 компонентов на сценарий")}</li>
                <li>{t("История изменений за 14 дней")}</li>
                <li>{t("Форматирование, комментарии и поиск")}</li>
                <li>{t("Экспорт PDF, DOCX и FDX")}</li>
              </ul>
              <a className="landing-button black" href="/free">
                {t("Открыть редактор ")}
                <ArrowRight size={15} />
              </a>
            </article>
            <article>
              <span className="plan-label">{t("Pro в браузере")}</span>
              <h3>Tyter Pro</h3>
              <p>{t("Полный редактор с локальными файлами.")}</p>
              <ul>
                <li>{t("Документы и компоненты без ограничений")}</li>
                <li>{t("Вся история изменений без ограничения срока")}</li>
                <li>{t("Реквизит с количеством и отчётами PDF")}</li>
                <li>{t("Локальное сохранение на вашем устройстве")}</li>
                <li>{t("Аутлайн с карточками истории и поиском")}</li>
                <li>{t("Импорт и экспорт TYT со всеми деталями")}</li>
              </ul>
              <a
                className="landing-button purple"
                href={donate}
                target="_blank"
                rel="noreferrer"
              >
                {t("Купить PRO ")}
                <ArrowRight size={15} />
              </a>
              <a className="landing-donate" href="/beta">
                {t("У меня есть ключ →")}
              </a>
            </article>
          </div>
        </section>
        <section className="landing-download" id="download">
          <h2>{t("Ваша история. На вашем устройстве.")}</h2>
          <p>
            {t(
              "Для активации Tyter Pro нужен уникальный код. Его можно получить у автора после отправки доната на",
            )}{" "}
            <a href={donate} target="_blank" rel="noreferrer">
              Boosty
            </a>
            .
          </p>
          <p className="landing-note">
            {t(
              "Введите email и ключ один раз. Сессия сохраняется надолго; для проверки доступа нужен интернет.",
            )}
          </p>
          <div className="landing-download-buttons">
            <a
              className="landing-button purple"
              href={donate}
              target="_blank"
              rel="noreferrer"
            >
              {t("Купить PRO ")}
              <ArrowRight size={16} />
            </a>
            <a className="landing-button black" href="/beta">
              {t("У меня есть ключ ")}
              <ArrowRight size={16} />
            </a>
          </div>
          <a
            className="landing-donate"
            href={donate}
            target="_blank"
            rel="noreferrer"
          >
            {t("Отправить донат и получить код ↗")}
          </a>
        </section>
        <section className="landing-help" id="help">
          <h2>{t("Помощь рядом")}</h2>
          <p>{t("Если код не подошёл или возник вопрос, напишите автору.")}</p>
          <a href="mailto:mrbuha@ya.ru">mrbuha@ya.ru</a>
          <a href="https://t.me/SergeyBuharev" target="_blank" rel="noreferrer">
            Telegram ↗
          </a>
        </section>
      </main>
      <footer className="landing-footer">
        (C) Made by{" "}
        <a href="https://t.me/SergeyBuharev" target="_blank" rel="noreferrer">
          Sergey Buharev
        </a>{" "}
        in 2026
      </footer>
    </div>
  );
}
