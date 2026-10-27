import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { t } from "./i18n.js";

export default function ScrollToTop({ containerRef }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const scroller = containerRef.current?.querySelector(".minimal-scroll");
    if (!scroller) return;
    const update = () => setVisible(scroller.scrollTop > 160);
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, [containerRef]);
  return (
    <button
      type="button"
      className={`icon-button scroll-top-button${visible ? " is-visible" : ""}`}
      aria-label={t("Прокрутить наверх")}
      data-tooltip={t("Прокрутить наверх")}
      aria-hidden={!visible}
      disabled={!visible}
      tabIndex={visible ? 0 : -1}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() =>
        containerRef.current?.querySelector(".minimal-scroll")?.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        })
      }
    >
      <ArrowUp size={20} aria-hidden="true" />
    </button>
  );
}
