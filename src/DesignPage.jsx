import { useState } from "react";
import { Download, Check, Shapes, Link2, Play } from "lucide-react";
import SiteLayout from "./SiteLayout.jsx";
import { useLanguage } from "./i18n.js";
import "./design-page.css";
export default function DesignPage() {
  const english = useLanguage() === "en";
  const tr = (ru, en) => (english ? en : ru);
  const [copied, setCopied] = useState(null);
  const [tab, setTab] = useState(0);
  const [zoom, setZoom] = useState(50);
  return (
    <SiteLayout
      page="design"
      title={tr("История в каждой детали", "A story in every detail")}
      description={tr(
        "Визуальный язык Tyter. Логотип, принципы и элементы интерфейса — всё в одном месте.",
        "Tyter’s visual language. The logo, principles and interface elements, all in one place.",
      )}
      feedLabel={tr("Дизайн Tyter", "Tyter design")}
    >
      <div className="design-resources">
        <nav
          className="design-sections"
          aria-label={tr("Разделы дизайна", "Design sections")}
        >
          {[
            ["brandbook", tr("Брендбук", "Brandbook")],
            ["guidelines", tr("Гайдлайны", "Guidelines")],
            ["ui-kit", "UI kit"],
          ].map(([id, title]) => (
            <a href={`#${id}`} key={id}>
              {title}
            </a>
          ))}
        </nav>
        <section id="brandbook" className="design-section">
          <span className="design-eyebrow">
            01 / {tr("БРЕНДБУК", "BRANDBOOK")}
          </span>
          <h2>{tr("Место для вашей истории", "Room for your story")}</h2>
          <p>
            {tr(
              "Спокойный интерфейс, ясные формы и акцент на тексте. Знак Tyter объединяет букву Т и экран — от первой строки до первого кадра.",
              "A calm interface, clear shapes and a focus on text. Tyter’s mark brings together the letter T and a screen, from the first line to the first frame.",
            )}
          </p>
          <div className="design-logo-grid">
            <div className="design-logo-sample light">
              <img
                src="/brand/tyter-logo.svg"
                alt={tr(
                  "Знак Tyter на светлом фоне",
                  "Tyter mark on a light background",
                )}
              />
              <span>Tyter</span>
            </div>
            <div className="design-logo-sample dark">
              <img
                src="/brand/tyter-logo.svg"
                alt={tr(
                  "Знак Tyter на тёмном фоне",
                  "Tyter mark on a dark background",
                )}
              />
              <span>Tyter</span>
            </div>
          </div>
          <a
            className="design-download"
            href="/brand/tyter-logo.svg"
            download="tyter-logo.svg"
          >
            <Download size={18} />
            {tr("Скачать логотип · SVG", "Download logo · SVG")}
          </a>
          <h3>{tr("Палитра", "Palette")}</h3>
          <div className="design-palette">
            {[
              ["#1C1A22", "Ink"],
              ["#F7F7FA", "Canvas"],
              ["#FFFFFF", "Paper"],
              ["#6D28D9", "Accent"],
            ].map(([color, title]) => (
              <button
                key={color}
                style={{ "--sample-color": color }}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(color);
                    setCopied(color);
                  } catch {
                    setCopied(null);
                  }
                }}
                aria-label={tr(
                  `Скопировать цвет ${color}`,
                  `Copy color ${color}`,
                )}
              >
                <span className="design-color" />
                <strong>{title}</strong>
                <small>{copied === color ? <Check size={14} /> : color}</small>
              </button>
            ))}
          </div>
        </section>
        <section id="guidelines" className="design-section">
          <span className="design-eyebrow">
            02 / {tr("ГАЙДЛАЙНЫ", "GUIDELINES")}
          </span>
          <h2>
            {tr("Меньше шума. Больше истории.", "Less noise. More story.")}
          </h2>
          <div className="design-principles">
            {[
              [
                tr("Текст на первом месте", "Text comes first"),
                tr(
                  "Интерфейс использует Inter, сценарий — Courier. Не меняйте пропорции знака и сохраняйте вокруг него свободное пространство не меньше четверти его высоты.",
                  "The interface uses Inter and the screenplay uses Courier. Preserve the logo’s proportions and leave clear space of at least a quarter of its height.",
                ),
              ],
              [
                tr("Цвет помогает ориентироваться", "Color helps navigation"),
                tr(
                  "Один акцент выделяет действие. Цвета страниц сопровождаются геометрическими фигурами и названиями, чтобы смысл сохранялся без различения оттенков.",
                  "One accent identifies an action. Page colors have geometric shapes and names, so meaning remains clear without distinguishing hues.",
                ),
              ],
              [
                tr("Движение объясняет действие", "Motion explains an action"),
                tr(
                  "Короткие переходы показывают изменение состояния. Перетаскивание сопровождается местом вставки, а настройка уменьшенной анимации учитывается во всём интерфейсе.",
                  "Short transitions explain state changes. Dragging shows an insertion point, and reduced motion preferences are respected throughout the interface.",
                ),
              ],
            ].map(([title, body]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <div className="design-type-sample">
            <span>Inter / UI</span>
            <strong>
              {tr("Сосредоточьтесь на истории", "Focus on the story")}
            </strong>
            <span>Courier / Screenplay</span>
            <p>
              INT. TYTER — DAY
              <br />
              {tr(
                "Новая история начинается с одной строки.",
                "A new story starts with a single line.",
              )}
            </p>
          </div>
        </section>
        <section id="ui-kit" className="design-section">
          <span className="design-eyebrow">03 / UI KIT</span>
          <h2>{tr("Знакомые элементы", "Familiar elements")}</h2>
          <p>
            {tr(
              "Базовые состояния элементов Tyter. Попробуйте переключатель и масштаб ниже.",
              "Tyter’s basic interface states. Try the view switch and zoom below.",
            )}
          </p>
          <div className="design-ui-sample">
            <div
              className="design-demo-tabs"
              role="group"
              aria-label={tr("Пример переключателя", "Switch example")}
            >
              {[
                tr("Сценарий", "Screenplay"),
                tr("Раскадровка", "Storyboard"),
              ].map((title, index) => (
                <button
                  aria-pressed={tab === index}
                  onClick={() => setTab(index)}
                  key={title}
                >
                  {title}
                </button>
              ))}
            </div>
            <div className="design-demo-icons">
              {[Shapes, Link2, Play].map((Icon, index) => (
                <span key={index}>
                  <Icon size={22} />
                </span>
              ))}
              <button disabled>{tr("Недоступно", "Disabled")}</button>
            </div>
            <label className="design-demo-range">
              {tr("Масштаб", "Zoom")}
              <input
                type="range"
                min="20"
                max="100"
                step="5"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <output>{zoom}%</output>
            </label>
          </div>
          <a
            className="design-download"
            href="/brand/tyter-ui-tokens.css"
            download
          >
            <Download size={18} />
            {tr("Скачать цвета интерфейса · CSS", "Download UI colors · CSS")}
          </a>
        </section>
      </div>
    </SiteLayout>
  );
}
