import { useCallback, useEffect, useRef, useState } from "react";
import { SelectMenu } from "./AppSelect.jsx";
import { t, useLanguage } from "./i18n.js";
import ScriptVersionIcon from "./ScriptVersionIcon.jsx";
import { SCRIPT_VERSIONS } from "./script-versions.js";

export default function ScriptVersionPicker({
  page,
  pageNumber = 1,
  disabled,
  onChange,
  feedback = false,
}) {
  useLanguage();
  const anchor = useRef(null);
  const leaveTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const active = page?.active || "white";
  const previous = useRef({ page: page?.id, active });
  const [bounce, setBounce] = useState(0);
  useEffect(() => {
    if (
      feedback &&
      previous.current.page === page?.id &&
      previous.current.active !== active
    )
      setBounce((value) => value + 1);
    previous.current = { page: page?.id, active };
  }, [feedback, page?.id, active]);
  const version =
    SCRIPT_VERSIONS.find(({ id }) => id === active) || SCRIPT_VERSIONS[0];
  const label = t("Цвет страницы {0}", pageNumber);
  const cancelClose = useCallback(() => clearTimeout(leaveTimer.current), []);
  const close = useCallback((restoreFocus = false) => {
    clearTimeout(leaveTimer.current);
    setOpen(false);
    if (restoreFocus) anchor.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const leave = () => {
    cancelClose();
    if (!keyboard) leaveTimer.current = setTimeout(() => close(), 180);
  };
  return (
    <div className="script-version-picker">
      <button
        ref={anchor}
        type="button"
        role="combobox"
        aria-label={label}
        aria-description={version.label}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-value={active}
        className="app-select-trigger script-version-trigger"
        disabled={disabled}
        onPointerEnter={(event) => {
          cancelClose();
          if (!disabled && event.pointerType !== "touch") {
            setKeyboard(false);
            setOpen(true);
          }
        }}
        onPointerLeave={leave}
        onClick={() => {
          cancelClose();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            setKeyboard(true);
            setOpen(true);
          }
          if (event.key === "Escape") close();
        }}
      >
        {feedback ? (
          <span
            key={bounce}
            className={`mobile-version-icon${bounce ? " is-changing" : ""}`}
            aria-hidden="true"
          >
            <ScriptVersionIcon versionId={active} size={18} />
          </span>
        ) : (
          <ScriptVersionIcon versionId={active} size={18} />
        )}
        <span className="script-version-mobile-label">{version.label}</span>
      </button>
      {open && !disabled && (
        <SelectMenu
          anchor={anchor.current}
          label={label}
          value={active}
          options={SCRIPT_VERSIONS.map((color) => ({
            value: color.id,
            label: color.label,
            icon: <ScriptVersionIcon versionId={color.id} />,
          }))}
          onSelect={(id) => {
            if (feedback && keyboard) close(true);
            onChange(id);
          }}
          onClose={close}
          autoFocus={keyboard}
          onPointerEnter={cancelClose}
          onPointerLeave={leave}
          menuMaxHeight={420}
          optionHeight={44}
        />
      )}
    </div>
  );
}
