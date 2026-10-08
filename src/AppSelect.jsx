import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export function SelectMenu({
  anchor,
  value,
  options,
  label,
  onSelect,
  onClose,
  compact = false,
}) {
  const menu = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor?.isConnected) return onClose(false);
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(
        innerWidth - 16,
        compact ? 112 : Math.max(180, rect.width),
      );
      const height = Math.min(320, options.length * 40 + 8);
      const below = innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const upwards = below < Math.min(height, 160) && above > below;
      const maxHeight = Math.min(height, Math.max(80, upwards ? above : below));
      setPosition({
        left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
        top: upwards ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4,
        width,
        maxHeight,
      });
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [anchor, compact, options.length, onClose]);
  useEffect(() => {
    const outside = (event) => {
      if (
        !menu.current?.contains(event.target) &&
        !anchor?.contains(event.target)
      )
        onClose(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [anchor, onClose]);
  useLayoutEffect(() => {
    if (!position || menu.current?.contains(document.activeElement)) return;
    const selected =
      menu.current?.querySelector('[aria-selected="true"]') ||
      menu.current?.querySelector('[role="option"]');
    selected?.focus({ preventScroll: true });
    if (selected && menu.current)
      menu.current.scrollTop = Math.max(
        0,
        selected.offsetTop - menu.current.clientHeight / 2,
      );
  }, [position]);
  return createPortal(
    <div
      ref={menu}
      role="listbox"
      aria-label={label}
      data-app-select-menu="true"
      className={`app-select-menu${compact ? " scene-variant-menu" : ""}`}
      style={position || { visibility: "hidden" }}
      onKeyDown={(event) => {
        const items = [...menu.current.querySelectorAll('[role="option"]')];
        const index = items.indexOf(document.activeElement);
        let next = null;
        if (event.key === "ArrowDown") next = (index + 1) % items.length;
        if (event.key === "ArrowUp")
          next = (index - 1 + items.length) % items.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = items.length - 1;
        if (next !== null) {
          event.preventDefault();
          event.stopPropagation();
          items[next]?.focus();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
        }
        if (event.key === "Tab") onClose(false);
      }}
    >
      {options.map((option) => (
        <button
          type="button"
          role="option"
          key={option.value}
          data-value={option.value}
          aria-selected={option.value === value}
          className="app-select-option"
          onClick={() => {
            onClose(false);
            onSelect(option.value);
          }}
        >
          {option.icon}
          <span>{option.label}</span>
          {option.value === value && <Check size={14} aria-hidden="true" />}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export default function AppSelect({
  value,
  options,
  label,
  onChange,
  className = "",
  compact = false,
}) {
  const anchor = useRef(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const current =
    options.find((option) => option.value === value) || options[0];
  const close = (restoreFocus) => {
    setOpen(false);
    if (restoreFocus) anchor.current?.focus({ preventScroll: true });
  };
  return (
    <>
      <button
        ref={anchor}
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-value={value}
        className={`app-select-trigger ${className}`}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {current?.icon}
        <span>{current?.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <SelectMenu
          anchor={anchor.current}
          value={value}
          options={options}
          label={label}
          compact={compact}
          onClose={close}
          onSelect={(next) => {
            onChange(next);
            anchor.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}
