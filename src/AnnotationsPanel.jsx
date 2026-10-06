import { t, useLanguage, languageLocale } from "./i18n.js";
import { ArrowRight, Box, Shapes, X } from "lucide-react";
export default function AnnotationsPanel({
  component,
  prop,
  onComponent,
  onProp,
  renderComponent,
  renderProp,
  onClose,
}) {
  const language = useLanguage();
  return (
    <aside
      className="components-drawer annotations-drawer"
      aria-label={t("Компонент и реквизит")}
    >
      <div className="drawer-heading">
        <h2>{t("Компонент и реквизит")}</h2>
        <button
          className="icon-button"
          aria-label={t("Закрыть детали текста")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="component-folders">
        {component && (
          <section className="annotation-section">
            <div className="annotation-heading">
              <Shapes size={16} />
              <strong>{t("Компонент")}</strong>
              <button
                className="icon-button"
                aria-label={t("Открыть компонент в списке")}
                data-tooltip={t("Перейти к компоненту")}
                onClick={() => onComponent(component)}
              >
                <ArrowRight size={16} />
              </button>
            </div>
            {renderComponent(component)}
          </section>
        )}
        {prop && (
          <section className="annotation-section">
            <div className="annotation-heading">
              <Box size={16} />
              <strong>{t("Реквизит")}</strong>
              <button
                className="icon-button"
                aria-label={t("Открыть реквизит в списке")}
                data-tooltip={t("Перейти к реквизиту")}
                onClick={() => onProp(prop)}
              >
                <ArrowRight size={16} />
              </button>
            </div>
            {renderProp(prop)}
          </section>
        )}
      </div>
    </aside>
  );
}
