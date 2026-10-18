import { t, useLanguage, languageLocale } from "./i18n.js";
import { ArrowLeft } from "lucide-react";
import { selectedPageVersions } from "./page-versions.js";
import { screenplayLayout } from "./document-layout.js";
import { documentFont } from "./document-fonts.js";
import { revisionPageStyle } from "./script-revisions.js";
import { SCRIPT_VERSIONS } from "./script-version-colors.js";
import ScriptVersionIcon from "./ScriptVersionIcon.jsx";
import { continuesExportParagraph } from "./export-page-versions.js";
import { isArrowOnly } from "./arrow-text.js";
import "./HistoryPreview.css";
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
export default function HistoryPreview({ revision, onExit, notes = false }) {
  const language = useLanguage();
  const blocks =
    (notes ? revision.snapshot.notes?.content : revision.snapshot.content)
      ?.content || [];
  const pages = notes ? [] : selectedPageVersions(revision.snapshot);
  const layout = screenplayLayout(revision.snapshot.metadata?.fontSize);
  const renderBlocks = (content, page, previousPage) =>
    content.map((block, index) => {
      const format = block.attrs?.format || "action";
      const isScene =
        format === "scene" &&
        !(index === 0 && page && continuesExportParagraph(page, previousPage));
      if (isScene) scene++;
      return (
        <p
          key={`${block.attrs?.blockId || index}:${index}`}
          className="screenplay-block"
          style={
            isArrowOnly(block.content?.map((part) => part.text || "").join(""))
              ? { textAlign: "center" }
              : undefined
          }
          data-format={format}
          data-scene-number={isScene ? scene : undefined}
        >
          {(block.content || []).map(renderedPart)}
        </p>
      );
    });
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
      {pages.length ? (
        <div
          className="history-preview-pages"
          style={{
            "--history-page-height": `${layout.height}px`,
            "--history-page-margin": `${layout.top}px`,
            "--script-font-size": `${layout.fontSize}pt`,
            "--script-font-family":
              '"open-arrow", ' +
              documentFont(revision.snapshot.metadata?.fontFamily).family,
          }}
        >
          {pages.map((page, index) => (
            <section
              className="history-preview-page"
              data-history-page={page.pageNumber}
              data-revision-color={page.versionId}
              key={page.pageId}
              style={revisionPageStyle(page.versionId)}
            >
              <header className="history-preview-page-heading">
                <span>
                  <ScriptVersionIcon versionId={page.versionId} size={14} />
                  {
                    (
                      SCRIPT_VERSIONS.find(
                        (entry) => entry.id === page.versionId,
                      ) || SCRIPT_VERSIONS[0]
                    ).label
                  }
                </span>
                <span>{page.pageNumber}</span>
              </header>
              <div className="screenplay-editor history-preview-content">
                {renderBlocks(page.content.content, page, pages[index - 1])}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="screenplay-editor history-preview-content">
          {renderBlocks(blocks)}
        </div>
      )}
    </div>
  );
}
