import AppSelect from "./AppSelect.jsx";
import { Trash2 } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import ScriptVersionIcon from "./ScriptVersionIcon.jsx";
import { SCRIPT_VERSIONS } from "./script-versions.js";

export default function ScriptVersionPicker({
  page,
  pageNumber = 1,
  disabled,
  onChange,
  onDelete,
  pendingDeletion,
  deleting,
}) {
  useLanguage();
  const active = page?.active || "white";
  const activeVersion =
    SCRIPT_VERSIONS.find((version) => version.id === active) ||
    SCRIPT_VERSIONS[0];
  return (
    <div className="script-version-picker">
      <AppSelect
        value={active}
        label={t("Версия страницы {0}", pageNumber)}
        className="script-version-trigger"
        disabled={disabled}
        menuMaxHeight={540}
        optionHeight={52}
        renderValue={() => (
          <span className="script-version-value">
            <span>{activeVersion.label.split(" ")[0]}</span>{" "}
            <ScriptVersionIcon versionId={active} size={13} />{" "}
            <span>{activeVersion.label.split(" ").slice(1).join(" ")}</span>
          </span>
        )}
        options={[
          ...SCRIPT_VERSIONS.map((version) => ({
            value: version.id,
            disabled: pendingDeletion === version.id,
            action:
              onDelete &&
              version.id !== "white" &&
              (version.id === active || !!page?.versions?.[version.id])
                ? {
                    label: t("Удалить копию {0}", version.label),
                    icon: <Trash2 size={16} aria-hidden="true" />,
                    className: "app-select-version-delete",
                    disabled: !!pendingDeletion || deleting,
                    onClick: () => onDelete(version.id),
                  }
                : undefined,
            icon: <ScriptVersionIcon versionId={version.id} />,
            label: (
              <span className="script-version-label">
                {version.label}
                {pendingDeletion === version.id && (
                  <small>{t("Удаляется…")}</small>
                )}
                {version.id !== active &&
                  pendingDeletion !== version.id &&
                  !page?.versions?.[version.id] && (
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
