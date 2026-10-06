import { t, useLanguage, languageLocale } from "./i18n.js";
import { ArrowLeft } from "lucide-react";
function renderedPart(part, index) {
  if (part.type === "hardBreak") return <br key={index} />;
  let result = part.text || "";
  for (const mark of [...(part.marks || [])].reverse()) {
    if (mark.type === "bold") result = <strong>{result}</strong>;
    if (mark.type === "italic") result = <em>{result}</em>;
    if (mark.type === "underline") result = <u>{result}</u>;
  }
  return <span key={index}>{result}</span>;
}
export default function HistoryPreview({ revision, onExit }) {
  const language = useLanguage();
  const blocks = revision.snapshot.content?.content || [];
  let scene = 0;
  return (
    <div
      className="history-document-preview"
      aria-label={t("Текст выбранной версии")}
    >
      <div className="history-preview-banner">
        <span>
          {t("Версия от")}{" "}
          {new Date(revision.createdAt).toLocaleString(languageLocale(), {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <button className="quiet-button" onClick={onExit}>
          <ArrowLeft size={14} />
          {t(" К текущему тексту")}
        </button>
      </div>
      <div className="screenplay-editor history-preview-content">
        {blocks.map((block, index) => {
          const format = block.attrs?.format || "action";
          if (format === "scene") scene++;
          return (
            <p
              key={block.attrs?.blockId || index}
              className="screenplay-block"
              data-format={format}
              data-scene-number={format === "scene" ? scene : undefined}
            >
              {(block.content || []).map(renderedPart)}
            </p>
          );
        })}
      </div>
    </div>
  );
}
