import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowDown, Check } from "lucide-react";
import SiteLayout from "./SiteLayout.jsx";
import { useLanguage } from "./i18n.js";
import CaseReveal, { CaseMotion } from "./CaseReveal.jsx";
import "./case-page.css";

let visualsRequest;
const loadVisuals = () => (visualsRequest ||= import("./CaseVisuals.jsx"));
const Visuals = lazy(loadVisuals);
function CaseMedia({ kind, language }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = () =>
    loadVisuals()
      .then(() => setReady(true))
      .catch(() => {
        visualsRequest = null;
        setFailed(true);
      });
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const skeleton = (
    <div className="case-skeleton case-skeleton-media" aria-hidden="true" />
  );
  return (
    <div
      className="case-media"
      ref={ref}
      data-media={kind}
      aria-busy={!ready && !failed}
    >
      {failed ? (
        <button
          className="case-retry"
          onClick={() => {
            setFailed(false);
            load();
          }}
        >
          {language === "en"
            ? "Load illustration again"
            : "Загрузить иллюстрацию снова"}
        </button>
      ) : ready ? (
        <Suspense fallback={skeleton}>
          <Visuals kind={kind} language={language} />
        </Suspense>
      ) : (
        skeleton
      )}
    </div>
  );
}

export default function CasePage() {
  const language = useLanguage();
  const en = language === "en";
  const tr = (ru, english) => (en ? english : ru);
  const heading = (title) => (
    <CaseReveal language={language}>
      <h2>{title}</h2>
    </CaseReveal>
  );
  const versions = [
    [
      "1.0",
      tr("Сценарий", "Screenplay"),
      tr(
        "Убрать трение между мыслью и строкой.",
        "Remove friction between a thought and a line.",
      ),
      tr(
        "Сценарные блоки, быстрое форматирование, подсказки, локальное сохранение и экспорт. Сначала — надёжное место для текста.",
        "Screenplay blocks, quick formatting, suggestions, local saving and export. First, a reliable place to write.",
      ),
    ],
    [
      "2.0",
      tr("Аутлайн", "Outline"),
      tr("Увидеть историю целиком.", "See the whole story."),
      tr(
        "Карточки и структура помогли работать с порядком сцен и драматургией. Следующий шаг показал: план и сценарий не должны расходиться.",
        "Cards and structure introduced scene ordering and dramatic arcs. The next step made the dependency clear: the plan and the script must stay in sync.",
      ),
    ],
    [
      "3.0",
      tr("Раскадровки", "Storyboards"),
      tr(
        "Соединить текст с будущим кадром.",
        "Connect the script to the future frame.",
      ),
      tr(
        "Вместо аутлайна — раскадровки. Одна карточка соответствует сцене и её варианту; внутри — слайды, длительности, статус, драматичность и съёмочные параметры.",
        "Storyboards replaced the outline. One card represents a scene and its variant, containing slides, timings, status, drama and production settings.",
      ),
    ],
  ];
  const decisions = [
    [
      tr("Цвет без лишних копий", "Color without extra copies"),
      tr(
        "Версионирование страниц усложняло перенос текста, поиск и удаление. У страниц оставили цветовую маркировку; варианты сцен и версии сценария сохранили собственный смысл.",
        "Page versioning complicated text flow, search and deletion. Pages kept color labels, while scene variants and screenplay versions retained their distinct purposes.",
      ),
    ],
    [
      tr("Одна сцена — два представления", "One scene, two views"),
      tr(
        "Вместо независимых карточек — общая сцена в сценарии и раскадровке. Из структуры можно перейти к конкретному абзацу; изменение драматичности видно и в настройках, и на графике.",
        "Instead of independent cards, the script and storyboard share a scene. Structure icons reveal exact paragraphs; drama changes appear in both scene settings and the chart.",
      ),
    ],
    [
      tr("Ссылки отдельно от компонентов", "Links separate from components"),
      tr(
        "Вставка URL больше не создаёт новую сущность. Обычная ссылка остаётся ссылкой, а компоненты собирают персонажей, локации и предметы с количеством и отчётом.",
        "Pasting a URL no longer creates an entity. A regular link stays a link, while components organize characters, locations and items with quantities and reports.",
      ),
    ],
    [
      tr(
        "Знакомый жест вместо инструкции",
        "A familiar gesture, less explanation",
      ),
      tr(
        "На компьютере сцены перемещаются удержанием мыши; на мобильном — долгим нажатием. Щипок меняет плотность раскадровки, а Ctrl + колесо масштабирует содержимое вьюпорта.",
        "On desktop, holding the mouse drags scenes; on mobile, a long press does. Pinching changes storyboard density, while Ctrl + wheel zooms the viewport content.",
      ),
    ],
  ];
  const metricGroups = [
    {
      id: "conversion",
      number: "01",
      value: "—%",
      title: tr("Конверсия", "Conversion"),
      lead: tr(
        "От интереса к первой истории",
        "From interest to a first story",
      ),
      summary: tr(
        "Проверить, помогает ли лендинг начать работу, а бесплатный редактор — получить первую ценность до предложения PRO.",
        "Test whether the landing page starts a writing journey and the free editor delivers value before the PRO offer.",
      ),
      rows: [
        [
          tr("Лендинг → редактор", "Landing → editor"),
          tr(
            "Посетители, открывшие редактор / посетители лендинга",
            "Visitors opening the editor / landing visitors",
          ),
        ],
        [
          tr("Активация", "Activation"),
          tr(
            "Новые пользователи с первой сохранённой непустой сценой / новые пользователи редактора",
            "New users with a first saved, non-empty scene / new editor users",
          ),
        ],
        [
          tr("Free → PRO", "Free → PRO"),
          tr(
            "Первые подтверждённые оплаты / активированные пользователи Free за 30 дней",
            "First confirmed payments / activated Free users over 30 days",
          ),
        ],
      ],
    },
    {
      id: "product",
      number: "02",
      value: "—",
      title: tr("Продукт", "Product"),
      lead: tr(
        "Возвращаются ли к своей истории?",
        "Do people return to their story?",
      ),
      summary: tr(
        "Главный кандидат на метрику ценности — авторы, которые за неделю вернулись и сохранили содержательное изменение сценария. Само открытие вкладки не считается работой.",
        "The proposed value metric is writers who return within a week and save a meaningful script change. Opening a tab alone does not count as writing.",
      ),
      rows: [
        [
          "WAW",
          tr(
            "Уникальные авторы с сохранённым изменением за неделю; определение события ещё предстоит проверить",
            "Weekly active writers with a saved edit; the event definition still needs validation",
          ),
        ],
        [
          tr("Удержание D7 / D30", "D7 / D30 retention"),
          tr(
            "Доля активированных авторов, вернувшихся к редактированию на 7-й / 30-й день",
            "Share of activated writers editing again on day 7 / day 30",
          ),
        ],
        [
          tr("Время до ценности", "Time to value"),
          tr(
            "Медиана от открытия редактора до первой сохранённой сцены; рядом — доля успешных сохранений и экспортов",
            "Median time from opening the editor to a first saved scene, alongside save and export success rates",
          ),
        ],
      ],
    },
    {
      id: "marketing",
      number: "03",
      value: "— ₽",
      title: tr("Маркетинг", "Marketing"),
      lead: tr(
        "Считать истории, а не только клики",
        "Count stories, not just clicks",
      ),
      summary: tr(
        "Сравнивать каналы по активированным авторам и оплатам. Телеграммы и HTML для чтения — гипотеза органического распространения, а не доказанный источник роста.",
        "Compare channels by activated writers and payments. Telegram messages and read-only HTML are an organic distribution hypothesis, not a proven growth channel.",
      ),
      rows: [
        [
          "CAC",
          tr(
            "Затраты на привлечение / новые платящие пользователи по каналу",
            "Acquisition spend / new paying users per channel",
          ),
        ],
        [
          "CTR → activation",
          tr(
            "Отдельно показы кликабельного материала, переходы и активации с UTM-источником",
            "Track impressions, clicks and UTM-attributed activations separately",
          ),
        ],
        [
          tr("Распространение", "Sharing"),
          tr(
            "Получатели опубликованных ссылок → открытия редактора → первые сохранённые сцены",
            "Recipients of published links → editor visits → first saved scenes",
          ),
        ],
      ],
    },
  ];
  return (
    <CaseMotion>
      <SiteLayout
        page="case"
        title={tr("От строки к кадру", "From a line to a frame")}
        titleContent={
          <CaseReveal language={language}>
            <h1>{tr("От строки к кадру", "From a line to a frame")}</h1>
          </CaseReveal>
        }
        description={tr(
          "Tyter — редактор, в котором история становится сценарием, а сценарий — раскадровкой. Продуктовый кейс о трёх версиях, решениях и следующем этапе роста.",
          "Tyter turns a story into a screenplay and a screenplay into a storyboard. A product case study of three versions, the decisions behind them and the next stage of growth.",
        )}
        feedLabel={tr("Продуктовый кейс Tyter", "Tyter product case study")}
      >
        <article className="case-study">
          <section
            className="case-opening"
            aria-label={tr("О проекте", "About the project")}
          >
            <div className="case-kicker">
              <span>TYTER / PRODUCT CASE</span>
              <span>2026</span>
            </div>
            <div className="case-statement">
              {tr(
                "История — одна. Способов увидеть её — больше.",
                "One story. More ways to see it.",
              )}
            </div>
            <p>
              {tr(
                "Инструмент для авторов сценариев и создателей визуальных историй. Работа над текстом, сценами и деталями съёмки собрана в одном пространстве, с сохранением на устройстве и возможностью передать проект дальше.",
                "A tool for screenwriters and visual storytellers. Writing, scenes and production details share one workspace, with on-device saving and portable projects.",
              )}
            </p>
            <dl className="case-facts">
              <div>
                <dt>{tr("Версии продукта", "Product versions")}</dt>
                <dd>3</dd>
              </div>
              <div>
                <dt>{tr("Режимы работы", "Workspace modes")}</dt>
                <dd>2</dd>
              </div>
              <div>
                <dt>{tr("Сергей Бухарев", "Sergey Buharev")}</dt>
                <dd className="case-fact-role">
                  {tr("Продукт · дизайн · бренд", "Product · design · brand")}
                </dd>
              </div>
            </dl>
            <CaseMedia kind="workflow" language={language} />
            <nav
              className="case-contents"
              aria-label={tr("Содержание кейса", "Case contents")}
            >
              {[
                ["challenge", tr("Задача", "Challenge")],
                ["versions", tr("3 версии", "3 versions")],
                ["decisions", tr("Решения", "Decisions")],
                ["brand", tr("Бренд и система", "Brand & system")],
                ["measurement", tr("Метрики", "Metrics")],
              ].map(([id, label]) => (
                <a href={`#${id}`} key={id}>
                  {label}
                  <ArrowDown size={14} aria-hidden="true" />
                </a>
              ))}
            </nav>
          </section>
          <section id="challenge" className="case-section">
            <span className="site-eyebrow">
              01 / {tr("ЗАДАЧА", "CHALLENGE")}
            </span>
            {heading(
              tr(
                "Не потерять историю между инструментами",
                "Keep the story together across tools",
              ),
            )}
            <p>
              {tr(
                "Рабочая гипотеза: автору приходится держать рядом текст, план сцен, изображения и заметки для съёмки. Когда эти представления независимы, их нужно обновлять вручную, а внимание уходит с истории на обслуживание документов.",
                "The working hypothesis: writers juggle a script, a scene plan, images and production notes. Independent representations need manual updates, shifting attention from the story to document maintenance.",
              )}
            </p>
            <div className="case-callout">
              {tr(
                "Задача продукта — сократить переключения и помочь пройти путь от первой строки до понятного другим проекта.",
                "The product goal: reduce context switches and help turn the first line into a project others can understand.",
              )}
            </div>
            <div className="case-two-col">
              <div>
                <h3>{tr("Для кого", "For whom")}</h3>
                <p>
                  {tr(
                    "Сценарист, которому нужен привычный формат; автор короткого метра, который собирает кадры; создатель проекта, которому важно передать текст и детали без потерь.",
                    "A screenwriter who needs familiar formatting; a short-film creator arranging frames; a project author sharing the script and its details intact.",
                  )}
                </p>
              </div>
              <div>
                <h3>{tr("Как узнаём о проблемах", "How problems surfaced")}</h3>
                <p>
                  {tr(
                    "По обратной связи в ходе разработки: скриншотам, конкретным сценариям использования и повторным проверкам. Это качественные сигналы, а не количественное исследование аудитории.",
                    "Through development feedback: screenshots, concrete usage scenarios and repeated checks. These are qualitative signals, not a quantitative audience study.",
                  )}
                </p>
              </div>
            </div>
          </section>
          <section id="versions" className="case-section">
            <span className="site-eyebrow">
              02 / {tr("ЭВОЛЮЦИЯ", "EVOLUTION")}
            </span>
            {heading(
              tr(
                "Три версии. Одна история развития.",
                "Three versions. One evolving story.",
              ),
            )}
            <p>
              {tr(
                "Всего у Tyter было три продуктовые версии. Каждая расширяла масштаб работы: строка → структура → визуальная сцена. Это этапы развития продукта, а не количество технических сборок.",
                "Tyter has had three product versions. Each expanded the scope of work: a line → structure → a visual scene. These are product generations, not a count of technical builds.",
              )}
            </p>
            <ol className="case-timeline">
              {versions.map(([number, title, goal, body]) => (
                <li key={number}>
                  <span className="case-version">{number}</span>
                  <div>
                    <h3>{title}</h3>
                    <strong>{goal}</strong>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section id="decisions" className="case-section">
            <span className="site-eyebrow">
              03 / {tr("ПРОЦЕСС И РЕШЕНИЯ", "PROCESS & DECISIONS")}
            </span>
            {heading(
              tr(
                "Упрощать модель, а не добавлять сущности",
                "Simplify the model before adding entities",
              ),
            )}
            <p>
              {tr(
                "Процесс строился короткими циклами: запрос → рабочая версия → проверка на реальном сценарии → уточнение поведения. Несколько заметных решений появились именно после пересмотра уже сделанной функциональности.",
                "The process used short cycles: a request → a working version → a concrete usage check → refined behavior. Several defining decisions came from revisiting functionality that already existed.",
              )}
            </p>
            <div className="case-decisions">
              {decisions.map(([title, body], index) => (
                <article key={title}>
                  <span className="case-step">0{index + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
            <CaseMedia kind="drama" language={language} />
            <p className="case-caption">
              {tr(
                "Схема взаимодействия, не пользовательские данные: фигура соответствует цвету страницы, вертикальное перемещение меняет драматичность сцены от 1 до 10.",
                "Interaction illustration, not user data: each shape represents a page color, and vertical dragging changes scene drama from 1 to 10.",
              )}
            </p>
          </section>
          <section id="brand" className="case-section">
            <span className="site-eyebrow">
              04 / {tr("БРЕНД И ДИЗАЙН-СИСТЕМА", "BRAND & DESIGN SYSTEM")}
            </span>
            {heading(
              tr(
                "Спокойный интерфейс. Узнаваемый характер.",
                "A calm interface. A recognizable character.",
              ),
            )}
            <p>
              {tr(
                "Бренд строится вокруг самой работы автора. Знак соединяет букву Т и экран; моноширинные заголовки отсылают к сценарию. Нейтральные поверхности оставляют место тексту, а фиолетовый акцент помогает находить действие.",
                "The brand centers on the writer’s work. The mark combines a T with a screen; monospaced headings reference the screenplay. Neutral surfaces leave room for text, while a purple accent points to action.",
              )}
            </p>
            <CaseMedia kind="brand" language={language} />
            <div className="case-two-col">
              <div>
                <h3>{tr("Основа системы", "System foundations")}</h3>
                <p>
                  {tr(
                    "Семантические цвета поверхностей, текста, акцента и границ; светлая и тёмная темы; типографическая иерархия; общие кнопки, вкладки, поля и сайдбары. Цвета страниц дополнены девятью фигурами — второй подсказкой, кроме цвета.",
                    "Semantic surface, text, accent and border tokens; light and dark themes; a type hierarchy; shared buttons, tabs, fields and sidebars. Nine page shapes provide a second cue beyond color.",
                  )}
                </p>
              </div>
              <div>
                <h3>
                  {tr(
                    "Поведение — тоже часть системы",
                    "Behavior belongs in the system too",
                  )}
                </h3>
                <p>
                  {tr(
                    "Состояния наведения и фокуса, области нажатия, безопасный переход к иконке ссылки, подсказки перетаскивания и отмена действия. Анимация Emotional стала общим приёмом приветствия и рассказа о продукте; уменьшение движения учитывается отдельно.",
                    "Hover and focus states, hit areas, a safe path to link icons, drag affordances and cancellation. Emotional animation became a shared welcome and storytelling pattern, with reduced-motion support.",
                  )}
                </p>
              </div>
            </div>
            <a className="case-link" href="/design">
              {tr(
                "Открыть брендбук, гайдлайны и UI kit",
                "Explore the brandbook, guidelines and UI kit",
              )}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </section>
          <section id="measurement" className="case-section case-measurement">
            <span className="site-eyebrow">
              05 / {tr("АНАЛИТИКА", "MEASUREMENT")}
            </span>
            {heading(
              tr(
                "Что продукт должен доказать",
                "What the product needs to prove",
              ),
            )}
            <p>
              {tr(
                "Функциональность уже можно проверять, а эффект для аудитории ещё предстоит измерить. Ниже — три отдельных блока для будущих данных. Прочерки означают отсутствие измерений, а не нулевой результат. Проценты роста и конверсии пока не заявляются.",
                "Functionality can be tested today; audience impact still needs measurement. The three blocks below reserve space for future data. Dashes mean unmeasured, not zero. No growth or conversion results are claimed yet.",
              )}
            </p>
          </section>
          {metricGroups.map((group) => (
            <section
              className="case-metric"
              id={`metrics-${group.id}`}
              key={group.id}
            >
              <span className="case-kicker">
                {tr("ПЛАН ИЗМЕРЕНИЙ", "MEASUREMENT PLAN")} / {group.number}
              </span>
              {heading(group.title)}
              <CaseReveal language={language}>
                <p className="case-metric-value">{group.value}</p>
              </CaseReveal>
              <h3>{group.lead}</h3>
              <p>{group.summary}</p>
              <dl>
                {group.rows.map(([name, definition]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{definition}</dd>
                  </div>
                ))}
              </dl>
              <span className="case-metric-status">
                {tr(
                  "Ожидает подключения аналитики и первой когорты",
                  "Awaiting analytics instrumentation and a first cohort",
                )}
              </span>
            </section>
          ))}
          <section className="case-section" id="next">
            <span className="site-eyebrow">
              06 / {tr("РЕЗУЛЬТАТ И СЛЕДУЮЩИЙ ШАГ", "OUTCOME & NEXT STEP")}
            </span>
            {heading(
              tr(
                "Работающий продукт — начало проверки",
                "A working product starts the validation",
              ),
            )}
            <p>
              {tr(
                "К третьей версии Tyter объединил сценарий и раскадровку, настройки сцен и компонентов, локальное сохранение и форматы для передачи проекта. Проверка качества охватывает сохранение и восстановление, экспорт, светлую и тёмную темы, мобильные жесты и управление мышью.",
                "By version three, Tyter brings together script and storyboard, scene and component settings, local saving and portable export formats. Quality checks cover saving and restoration, export, both themes, mobile gestures and mouse interactions.",
              )}
            </p>
            <ul className="case-next">
              {[
                tr(
                  "Проверить первую сессию: понимает ли новый автор форматирование и сохраняет ли первую сцену без помощи.",
                  "Validate the first session: can a new writer understand formatting and save a first scene without help?",
                ),
                tr(
                  "Сравнить текстовый и визуальный сценарии работы: когда раскадровка помогает, а когда отвлекает.",
                  "Compare text and visual workflows: when does a storyboard help, and when does it distract?",
                ),
                tr(
                  "Подключить согласованную аналитику событий без отправки содержимого сценариев; затем собрать базовую линию по каналам и когортам.",
                  "Instrument consent-aware events without sending script content, then establish channel and cohort baselines.",
                ),
              ].map((item) => (
                <li key={item}>
                  <Check size={18} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="case-caption">
              {tr(
                "Кейс описывает решения и обратную связь в процессе создания Tyter. Версии 1.0 / 2.0 / 3.0 указаны автором проекта. Иллюстрации демонстрационные; результаты пользовательской аналитики будут добавлены после измерений.",
                "This case documents Tyter’s development decisions and feedback. Versions 1.0 / 2.0 / 3.0 were confirmed by the project author. Illustrations are demonstrations; user analytics results will be added after measurement.",
              )}
            </p>
            <a className="site-button black" href="/free">
              {tr("Начать свою историю", "Start your story")}
              <ArrowUpRight size={20} aria-hidden="true" />
            </a>
          </section>
        </article>
      </SiteLayout>
    </CaseMotion>
  );
}
