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
  return (
    <aside
      className="components-drawer annotations-drawer"
      aria-label="Компонент и реквизит"
    >
      <div className="drawer-heading">
        <h2>Компонент и реквизит</h2>
        <button
          className="icon-button"
          aria-label="Закрыть детали текста"
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
              <strong>Компонент</strong>
              <button
                className="icon-button"
                aria-label="Открыть компонент в списке"
                data-tooltip="Перейти к компоненту"
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
              <strong>Реквизит</strong>
              <button
                className="icon-button"
                aria-label="Открыть реквизит в списке"
                data-tooltip="Перейти к реквизиту"
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
