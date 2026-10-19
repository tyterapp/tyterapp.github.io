import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  FileText,
  FolderOpen,
  Keyboard,
  LifeBuoy,
  Shapes,
  WifiOff,
} from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import SiteLayout from "./SiteLayout.jsx";
import { BLOG_ARTICLES, BLOG_CATEGORIES } from "./site-content.js";

export function BlogPage({ article }) {
  const language = useLanguage();
  const copy = (values) => values[language === "en" ? 1 : 0];
  const initial = new URLSearchParams(location.search).get("category");
  const [category, setCategory] = useState(
    BLOG_CATEGORIES.some(({ id }) => id === initial) ? initial : "all",
  );
  const filtered = BLOG_ARTICLES.filter(
    (item) => category === "all" || item.category === category,
  );
  return (
    <SiteLayout
      page="blog"
      title={
        language === "en" ? "The story starts here" : "История начинается здесь"
      }
      description={
        language === "en"
          ? "Notes on screenplay format and working in Tyter. Find a useful idea and get back to your story."
          : "Заметки о сценарном формате и работе в Tyter. Найдите полезную идею и вернитесь к своей истории."
      }
      feedLabel={t("Блог Tyter")}
    >
      <nav className="blog-categories" aria-label={t("Категории блога")}>
        {BLOG_CATEGORIES.map(({ id, ru, en }) =>
          article ? (
            <a
              key={id}
              href={`/blog?category=${id}`}
              aria-current={article.category === id ? "page" : undefined}
            >
              {language === "en" ? en : ru}
            </a>
          ) : (
            <button
              key={id}
              type="button"
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
            >
              {language === "en" ? en : ru}
            </button>
          ),
        )}
      </nav>
      {article ? (
        <article className="blog-article">
          <a className="site-text-link" href="/blog">
            <ArrowLeft size={18} aria-hidden="true" />
            {t("Все статьи")}
          </a>
          <span className="site-eyebrow">
            {language === "en" ? "TYTER JOURNAL" : "ЖУРНАЛ TYTER"}
          </span>
          <h2>{copy(article.title)}</h2>
          <p className="blog-article-lead">{copy(article.summary)}</p>
          {article.sections.map(([heading, body], index) => (
            <section key={index}>
              <h3>{copy(heading)}</h3>
              <p>{copy(body)}</p>
            </section>
          ))}
          {article.source && (
            <p className="blog-source">
              {t("Подробнее о сценарном формате:")}{" "}
              <a href={article.source.url} target="_blank" rel="noreferrer">
                {article.source.label}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </p>
          )}
        </article>
      ) : (
        <div className="blog-list">
          {filtered.map((item) => (
            <a
              className="blog-card"
              href={`/blog/${item.slug}`}
              key={item.slug}
            >
              <div
                className={`blog-card-art is-${item.category}`}
                aria-hidden="true"
              >
                <FileText size={62} />
                <span>
                  {item.category === "format"
                    ? "INT. / EXT."
                    : item.slug === "sohranenie-i-oflayn"
                      ? ".TYT"
                      : "A → B → C"}
                </span>
              </div>
              <div className="blog-card-copy">
                <span className="site-eyebrow">
                  {copy([
                    BLOG_CATEGORIES.find(({ id }) => id === item.category).ru,
                    BLOG_CATEGORIES.find(({ id }) => id === item.category).en,
                  ])}{" "}
                  · {item.minutes} {language === "en" ? "min" : "мин"}
                </span>
                <h2>{copy(item.title)}</h2>
                <p>{copy(item.summary)}</p>
                <span className="site-text-link">
                  {t("Читать статью")}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </SiteLayout>
  );
}

export function HelpPage() {
  const language = useLanguage();
  const text = (ru, en) => (language === "en" ? en : ru);
  const items = [
    [
      Keyboard,
      text("Как форматировать текст?", "How do I format text?"),
      text(
        "Выберите тип абзаца на нижней панели или используйте Ctrl + 1–7. Выделенный текст можно копировать и вставлять с форматированием.",
        "Select a paragraph type in the bottom toolbar or use Ctrl + 1–7. Selected text can be copied and pasted with its formatting.",
      ),
    ],
    [
      FolderOpen,
      text(
        "Как сохранить и открыть сценарий?",
        "How do I save and open a script?",
      ),
      text(
        "Текст сохраняется автоматически на устройстве. Меню документов позволяет создавать и открывать сценарии, а кнопка скачивания — экспортировать PDF, DOCX или FDX. В PRO доступен полный проект TYT.",
        "Text is saved automatically on your device. The document menu creates and opens scripts; the download button exports PDF, DOCX or FDX. PRO also supports complete TYT projects.",
      ),
    ],
    [
      WifiOff,
      text("Можно работать без интернета?", "Can I work offline?"),
      text(
        "Да. Сначала откройте редактор с интернетом и дождитесь загрузки. Для PRO один раз подтвердите email и ключ онлайн. После этого потеря связи не закрывает документ, и редактор можно перезагрузить без сети.",
        "Yes. First open the editor online and let it load. Verify your PRO email and key online once. After that, losing the connection does not close your document and the editor can reload offline.",
      ),
    ],
    [
      Shapes,
      text("Чем Free отличается от PRO?", "How do Free and PRO differ?"),
      text(
        "Free позволяет работать с двумя документами и десятью компонентами на сценарий; история доступна за 14 дней. PRO снимает эти ограничения и добавляет раскадровку, реквизит с отчётами и полный формат TYT.",
        "Free includes two documents, ten components per script and 14 days of history. PRO removes these limits and adds storyboards, props reports and complete TYT project format.",
      ),
    ],
    [
      LifeBuoy,
      text("Как открыть PRO?", "How do I open PRO?"),
      text(
        "Перейдите на /pro и введите email и ключ доступа. Если ключ не подошёл, проверьте оба поля или напишите автору.",
        "Open /pro and enter your email and access key. If the key is rejected, check both fields or contact the author.",
      ),
    ],
  ];
  return (
    <SiteLayout
      page="help"
      title={text("Помощь рядом", "Help is here")}
      description={text(
        "Короткие ответы, чтобы вы могли продолжить писать. Если вопрос остался — напишите в чат.",
        "Quick answers to help you keep writing. If you still have a question, join the chat.",
      )}
      feedLabel={t("Помощь Tyter")}
    >
      <section className="help-contact">
        <LifeBuoy size={28} aria-hidden="true" />
        <h2>{text("Давайте разберёмся", "Let’s work it out")}</h2>
        <p>
          {text(
            "Расскажите, что произошло, и укажите браузер и устройство. Мы поможем найти решение.",
            "Tell us what happened, along with your browser and device. We’ll help find a solution.",
          )}
        </p>
        <a
          className="site-button purple"
          href="https://t.me/ultraproduct"
          target="_blank"
          rel="noreferrer"
        >
          {text("Открыть чат", "Open chat")}
          <ArrowUpRight size={20} aria-hidden="true" />
        </a>
        <a className="site-text-link" href="mailto:mrbuha@ya.ru">
          mrbuha@ya.ru
        </a>
      </section>
      <div className="help-list">
        {items.map(([Icon, question, answer], index) => (
          <details className="help-answer" key={index} open={index === 0}>
            <summary>
              <Icon size={21} aria-hidden="true" />
              <h2>{question}</h2>
              <span aria-hidden="true">+</span>
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
      <a className="site-text-link" href="/blog">
        {text(
          "Ещё больше о работе в Tyter — в блоге",
          "More about using Tyter in the blog",
        )}
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
    </SiteLayout>
  );
}
