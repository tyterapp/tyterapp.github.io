import AppSelect from "./AppSelect.jsx";
import { Trash2 } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import {
  SCRIPT_VERSIONS,
  scriptVersionId,
  isScriptVersionCopy,
} from "./script-versions.js";

export default function ScriptVersionPicker({
  document,
  disabled,
  onChange,
  onDelete,
  pendingDeletion,
  deleting,
}) {
  useLanguage();
  return (
    <div className="script-version-picker">
      <AppSelect
        value={scriptVersionId(document)}
        label={t("Версии сценария")}
        className="script-version-trigger"
        disabled={disabled}
        menuMaxHeight={540}
        optionHeight={52}
        options={[
          ...SCRIPT_VERSIONS.map((version) => ({
            value: version.id,
            disabled: pendingDeletion === version.id,
            action:
              onDelete && isScriptVersionCopy(document, version.id)
                ? {
                    label: t("Удалить копию {0}", version.label),
                    icon: <Trash2 size={16} aria-hidden="true" />,
                    className: "app-select-version-delete",
                    disabled: !!pendingDeletion || deleting,
                    onClick: () => onDelete(version.id),
                  }
                : undefined,
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
                {pendingDeletion === version.id && (
                  <small>{t("Удаляется…")}</small>
                )}
                {version.id !== scriptVersionId(document) &&
                  pendingDeletion !== version.id &&
                  !document.scriptVersions?.[version.id] && (
                    <small>{t("Создать копию")}</small>
                  )}
              </span>
            ),
          })),
        ]}
        onChange={onChange}
      />
    </div>
  );
}
