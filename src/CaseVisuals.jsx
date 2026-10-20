import { Crop, Plus, ArrowRight } from "lucide-react";
import ScriptVersionIcon from "./ScriptVersionIcon.jsx";
import { SCRIPT_VERSIONS } from "./script-version-colors.js";

export default function CaseVisuals({ kind, language }) {
  const tr = (ru, en) => (language === "en" ? en : ru);
  if (kind === "brand")
    return (
      <div
        className="case-brand-visual"
        role="img"
        aria-label={tr(
          "Логотип Tyter, типографика и девять цветовых фигур страниц",
          "Tyter logo, typography and nine page color shapes",
        )}
      >
        <div className="case-brand-mark">
          <img
            src="/brand/tyter-logo.svg"
            alt=""
            width="72"
            height="72"
            loading="lazy"
            decoding="async"
          />
          <strong>Tyter</strong>
        </div>
        <div className="case-brand-type">
          <span>UI / Inter</span>
          <strong>{tr("Место для истории", "Room for a story")}</strong>
          <span>Screenplay / Courier</span>
          <p>INT. TYTER — DAY</p>
        </div>
        <div className="case-shapes">
          {SCRIPT_VERSIONS.map((version) => (
            <ScriptVersionIcon
              key={version.id}
              versionId={version.id}
              size={24}
            />
          ))}
        </div>
      </div>
    );
  if (kind === "drama")
    return (
      <div
        className="case-drama-visual"
        role="img"
        aria-label={tr(
          "Пример графика драматичности с фигурами цветов страниц",
          "Example drama chart with page color shapes",
        )}
      >
        <div className="case-mock-bar">
          <span>{tr("График драматичности", "Drama chart")}</span>
          <span>1—10</span>
        </div>
        <svg viewBox="0 0 600 230" aria-hidden="true">
          {[42, 90, 138, 186].map((y) => (
            <line key={y} x1="24" x2="576" y1={y} y2={y} />
          ))}
          <polyline points="60,170 180,113 300,145 420,42 540,80" />
          {[
            [60, 170, "white"],
            [180, 113, "blue"],
            [300, 145, "pink"],
            [420, 42, "yellow"],
            [540, 80, "green"],
          ].map(([x, y, color], index) => (
            <g key={color}>
              <g transform={`translate(${x - 10} ${y - 10})`}>
                <ScriptVersionIcon versionId={color} size={20} />
              </g>
              <text x={x} y="222" textAnchor="middle">
                {index + 1} A
              </text>
            </g>
          ))}
        </svg>
        <p>
          {tr(
            "Сцена → настройки → график. Одно значение во всех представлениях.",
            "Scene → settings → chart. One value across every view.",
          )}
        </p>
      </div>
    );
  return (
    <div
      className="case-workflow-visual"
      role="img"
      aria-label={tr(
        "Схема перехода от текста сценария к карточкам сцен",
        "A script-to-storyboard workflow illustration",
      )}
    >
      <div className="case-mock-bar">
        <img src="/brand/tyter-logo.svg" alt="" width="22" height="22" />
        <span>Untitled</span>
        <span className="case-mock-modes">
          {tr("Сценарий / Раскадровка", "Script / Storyboard")}
        </span>
      </div>
      <div className="case-workflow-body">
        <div className="case-mock-paper">
          <span>1 A</span>
          <strong>{tr("ИНТ. КОМНАТА — ДЕНЬ", "INT. ROOM — DAY")}</strong>
          <p>
            {tr(
              "Новая история начинается с одной строки.",
              "A new story starts with one line.",
            )}
          </p>
          <div className="case-mock-dialogue">
            {tr("АВТОР", "WRITER")}
            <br />
            {tr("А что, если?..", "What if?..")}
          </div>
        </div>
        <ArrowRight className="case-workflow-arrow" aria-hidden="true" />
        <div className="case-mock-board">
          {["white", "blue", "pink"].map((color, index) => (
            <div key={color}>
              <div className={`case-mock-frame is-${color}`}>
                <Crop size={26} />
                <ScriptVersionIcon versionId={color} size={14} />
              </div>
              <small>
                {index + 1} A · {tr("Сцена", "Scene")}
              </small>
            </div>
          ))}
          <div className="case-mock-add">
            <Plus size={24} />
          </div>
        </div>
      </div>
      <span className="case-visual-label">
        {tr(
          "Демонстрационная схема интерфейса",
          "Illustrative interface diagram",
        )}
      </span>
    </div>
  );
}
