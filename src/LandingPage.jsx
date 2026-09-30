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
  if (panel === "Аутлайн · Pro")
    return (
      <div className="landing-outline-preview" aria-label="Карточки аутлайна">
        {["Завязка", "Развитие", "Развязка"].map((act, index) => (
          <section key={act}>
            <strong>Акт {index + 1}</strong>
            {[
              act,
              ["Незваный гость", "Поиски ответа", "Возвращение домой"][index],
            ].map((title, cardIndex) => (
              <article key={title}>
                <strong style={{ color: cardIndex ? "#37343d" : "#1b2eff" }}>
                  ▣ {title}
                </strong>
                <p>
                  {
                    [
                      "Кошка замечает открытое окно. На улице начинается новая история.",
                      "Анна ищет кошку в городе и встречает того, кто знает дорогу.",
                      "Квартира снова полна света. Кошка возвращается домой.",
                    ][index]
                  }
                </p>
              </article>
            ))}
          </section>
        ))}
      </div>
    );
  if (panel === "Файлы TYT · Pro")
    return (
      <div
        className="landing-tyt-preview"
        aria-label="Проект Tyter в одном файле"
      >
        <div className="landing-tyt-file">
          <FolderOpen size={38} />
          <strong>Глазами кошки.tyt</strong>
          <span>Вся история в одном файле</span>
        </div>
        <div className="landing-tyt-items">
          {[
            "Сценарий",
            "Аутлайн",
            "Комментарии",
            "Компоненты",
            "Реквизит",
            "Обложка и авторство",
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
        panel ? `Предпросмотр: ${panel}` : "Предпросмотр редактора Tyter"
      }
    >
      <div className="preview-top">
        <span>
          <img src="/brand/tyter-logo.svg" alt="" />
          Глазами кошки <small>⌄</small>
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
          <b>ИНТ. КВАРТИРА — УТРО</b>
          <p>
            Кошка наблюдает за городом с подоконника. Внизу спешат люди, а на
            кухне тихо звенит пустая миска.
          </p>
          <div className="preview-dialogue">
            <b>КОШКА</b>
            <br />
            Кажется, у них опять свои планы на завтрак.
          </div>
          <b>ИНТ. КВАРТИРА — ДЕНЬ</b>
          <p>
            <span
              className={
                panel === "Реквизит" ? "preview-orange" : "preview-blue"
              }
            >
              Миска
            </span>{" "}
            всё ещё пуста. Анна открывает дверь.
          </p>
        </div>
        {panel && (
          <aside className="preview-panel">
            <strong>{panel}</strong>
            {panel === "Компоненты" ? (
              <>
                <small>Персонажи</small>
                <div>
                  ♧ Анна <small>Главная героиня</small>
                </div>
                <div>
                  ♧ Кошка <small>Внимательный наблюдатель</small>
                </div>
                <small>Места</small>
                <div>♧ Квартира</div>
              </>
            ) : panel === "Статистика" ? (
              <>
                <div className="preview-metrics">
                  <b>
                    12<small>страниц</small>
                  </b>
                  <b>
                    12 мин<small>хронометраж</small>
                  </b>
                  <b>
                    8<small>сцен</small>
                  </b>
                  <b>
                    24<small>реплики</small>
                  </b>
                </div>
                <small>Доля диалогов</small>
                <div className="preview-chart">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <small>
                  Кошка · 14 реплик
                  <br />
                  Анна · 10 реплик
                </small>
              </>
            ) : panel === "Реквизит" ? (
              <>
                <div>
                  ▧ Миска <small>1 шт. · В тексте: 3</small>
                </div>
                <div>
                  ▧ Ключи <small>1 шт. · В тексте: 2</small>
                </div>
                <div>
                  ▧ Телефон <small>1 шт. · В тексте: 4</small>
                </div>
                <span className="preview-report">↓ Отчёт в PDF</span>
              </>
            ) : (
              <>
                <div>
                  Сегодня, 12:42<small>Изменён текст сценария</small>
                </div>
                <div>
                  Сегодня, 12:30<small>Добавлен компонент «Анна»</small>
                </div>
                <div>
                  Вчера, 18:15<small>Первая сцена</small>
                </div>
                <small>История хранится на устройстве</small>
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
  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Tyter — главная">
          <img src="/brand/tyter-logo.svg" alt="" />
          Tyter
        </a>
        <nav aria-label="Основная навигация">
          <a href="#features">Продукт</a>
          <a href="#pro">Pro</a>
          <a href="#help">Помощь</a>
        </nav>
        <a className="landing-button black" href="/free">
          Попробовать
        </a>
        <a className="landing-button purple" href="#pro">
          Купить PRO
        </a>
      </header>
      <main>
        <section className="landing-hero">
          <h1>Сценарий без хаоса</h1>
          <p>
            Tyter помогает сценаристам быстрее собирать сцены, структуру и
            детали проекта.
          </p>
          <Preview />
        </section>
        <div id="features">
          {features.map(([title, description]) => (
            <section className="landing-feature" key={title}>
              <h2>{title}</h2>
              <p>{description}</p>
              <Preview panel={title} />
            </section>
          ))}
        </div>
        <section className="landing-editions" id="pro">
          <h2>Выберите свой ритм</h2>
          <div className="landing-plan-grid">
            <article>
              <span className="plan-label">В браузере</span>
              <h3>Пробная версия</h3>
              <p>Для знакомства с редактором, бесплатно.</p>
              <ul>
                <li>2 документа и 10 компонентов на сценарий</li>
                <li>История изменений за 14 дней</li>
                <li>Форматирование, комментарии и поиск</li>
                <li>Экспорт PDF, DOCX и FDX</li>
              </ul>
              <a className="landing-button black" href="/free">
                Открыть редактор <ArrowRight size={15} />
              </a>
            </article>
            <article>
              <span className="plan-label">Pro в браузере</span>
              <h3>Tyter Pro</h3>
              <p>Полный редактор с локальными файлами.</p>
              <ul>
                <li>Документы и компоненты без ограничений</li>
                <li>Вся история изменений без ограничения срока</li>
                <li>Реквизит с количеством и отчётами PDF</li>
                <li>Локальное сохранение на вашем устройстве</li>
                <li>Аутлайн с карточками истории и поиском</li>
                <li>Импорт и экспорт TYT со всеми деталями</li>
              </ul>
              <a
                className="landing-button purple"
                href={donate}
                target="_blank"
                rel="noreferrer"
              >
                Купить PRO <ArrowRight size={15} />
              </a>
              <a className="landing-donate" href="/pro">
                У меня есть ключ →
              </a>
            </article>
          </div>
        </section>
        <section className="landing-download" id="download">
          <h2>Ваша история. На вашем устройстве.</h2>
          <p>
            Для активации Tyter Pro нужен уникальный код. Его можно получить у
            автора после отправки доната на{" "}
            <a href={donate} target="_blank" rel="noreferrer">
              Boosty
            </a>
            .
          </p>
          <p className="landing-note">
            Введите email и ключ один раз. Сессия сохраняется надолго; для
            проверки доступа нужен интернет.
          </p>
          <div className="landing-download-buttons">
            <a
              className="landing-button purple"
              href={donate}
              target="_blank"
              rel="noreferrer"
            >
              Купить PRO <ArrowRight size={16} />
            </a>
            <a className="landing-button black" href="/pro">
              У меня есть ключ <ArrowRight size={16} />
            </a>
          </div>
          <a
            className="landing-donate"
            href={donate}
            target="_blank"
            rel="noreferrer"
          >
            Отправить донат и получить код ↗
          </a>
        </section>
        <section className="landing-help" id="help">
          <h2>Помощь рядом</h2>
          <p>Если код не подошёл или возник вопрос, напишите автору.</p>
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
