import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { t } from "./i18n.js";
export default function BrandContextMenu({ position, onClose, items }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.querySelector("a")?.focus();
    const outside = (event) => {
      if (!ref.current.contains(event.target)) onClose();
    };
    const key = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      className="brand-context-menu"
      role="menu"
      aria-label={t("Материалы бренда")}
      style={{
        left: Math.min(position.left, innerWidth - 208),
        top: Math.min(position.top, innerHeight - 144),
      }}
    >
      {(
        items || [
          ["/design#brandbook", "Брендбук"],
          ["/design#guidelines", "Гайдлайны"],
          ["/design#ui-kit", "UI кит"],
        ]
      ).map(([href, label, prefetch]) => (
        <a
          key={href}
          role="menuitem"
          href={href}
          onPointerEnter={prefetch}
          onFocus={prefetch}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
        >
          {t(label)}
        </a>
      ))}
    </div>,
    document.body,
  );
}
