import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { t } from "./i18n.js";

export default function MobileSheet({
  mobile,
  ready = true,
  open,
  label,
  onClose,
  children,
}) {
  const ref = useRef(null),
    drag = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    if (!ready || !mobile || !open) return;
    const app = document.querySelector(".minimal-app"),
      previous = document.activeElement;
    const wasInert = app?.inert;
    if (app) app.inert = true;
    ref.current
      .querySelector(".mobile-sheet-handle")
      ?.focus({ preventScroll: true });
    const keyboard = (event) => {
      // A nested dialog or portaled select owns its own keys.
      if (
        document.querySelector("dialog[open]") ||
        !ref.current?.contains(event.target)
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const buttons = [
        ...ref.current.querySelectorAll(
          'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length);
      const first = buttons[0],
        last = buttons.at(-1);
      if (event.shiftKey && event.target === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && event.target === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      if (app) app.inert = wasInert;
      if (previous?.isConnected && !previous.closest("[inert]"))
        previous.focus({ preventScroll: true });
    };
  }, [mobile, open, ready]);
  if (!ready) return null;
  if (!mobile) return children;
  if (!open) return null;
  return createPortal(
    <div className="mobile-sheet-layer" ref={ref}>
      <button
        className="mobile-sheet-backdrop"
        tabIndex={-1}
        aria-label={t("Закрыть шторку")}
        onClick={onClose}
      />
      <section
        className="mobile-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <button
          className="mobile-sheet-handle"
          aria-label={t("Закрыть шторку")}
          onClick={onClose}
          onPointerDown={(event) => {
            drag.current = event.clientY;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) return;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Synthetic pointers have no active capture target.
            }
          }}
          onPointerUp={(event) => {
            if (drag.current !== null && event.clientY - drag.current > 60)
              onClose();
            drag.current = null;
          }}
        >
          <span />
        </button>
        <div className="mobile-sheet-content">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
