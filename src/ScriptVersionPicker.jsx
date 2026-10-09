import AppSelect from "./AppSelect.jsx";
import { StickyNote } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { SCRIPT_VERSIONS, scriptVersionId } from "./script-versions.js";

export default function ScriptVersionPicker({
  document,
  disabled,
  onChange,
  onNotes,
}) {
  useLanguage();
  return (
    <div className="script-version-picker">
      <AppSelect
        value={scriptVersionId(document)}
        label={t("Версии сценария")}
        className="script-version-trigger"
        disabled={disabled}
        menuMaxHeight={480}
        optionHeight={52}
        options={SCRIPT_VERSIONS.map((version) => ({
          value: version.id,
          action: onNotes
            ? {
                label: t("Заметки {0}", version.label),
                icon: <StickyNote size={17} />,
                onClick: () => onNotes(version.id),
              }
            : null,
          icon: (
            <span
              aria-hidden="true"
              className="script-version-swatch"
              style={{
                "--version-hue": version.hue,
                "--version-swatch-lightness":
                  version.id === "white"
                    ? 1
                    : version.id === "cherry"
                      ? 0.82
                      : 0.92,
                "--version-swatch-chroma": version.id === "white" ? 0 : 0.08,
              }}
            />
          ),
          label: (
            <span className="script-version-label">
              {version.label}
              {version.id !== scriptVersionId(document) &&
                !document.scriptVersions?.[version.id] && (
                  <small>{t("Создать копию")}</small>
                )}
            </span>
          ),
        }))}
        onChange={onChange}
      />
    </div>
  );
}
