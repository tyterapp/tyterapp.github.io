import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ScriptVersionPicker from "./ScriptVersionPicker.jsx";
import { SCRIPT_VERSIONS } from "./script-versions.js";
import { t, useLanguage } from "./i18n.js";

// Track the page being read without changing the editor selection or updating
// the whole workspace on every scroll event.
export default function MobilePageControls({ pages, disabled, onChange }) {
  useLanguage();
  const bar = useRef(null),
    latest = useRef(pages),
    refresh = useRef(null);
  latest.current = pages;
  const [index, setIndex] = useState(0);
  useLayoutEffect(() => {
    const scroller = bar.current
      ?.closest(".editor-column")
      ?.querySelector(".minimal-scroll");
    const paper = scroller?.querySelector(".script-paper");
    const app = scroller?.closest(".minimal-app");
    if (!scroller || !paper || !app) return;
    let frame;
    const update = () => {
      const position =
        scroller.scrollTop -
        (paper.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop);
      let next = 0;
      latest.current.forEach((page, i) => {
        if (page.top <= position + 1) next = i;
      });
      setIndex(next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    refresh.current = schedule;
    scroller.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    observer.observe(paper);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener("scroll", schedule);
      refresh.current = null;
      delete app.dataset.mobilePageColor;
      app.style.removeProperty("--mobile-page-hue");
      app.style.removeProperty("--mobile-page-chroma");
    };
  }, []);
  const geometry = pages.map(({ top }) => top).join(",");
  useEffect(() => refresh.current?.(), [geometry]);
  const physical = pages[Math.min(index, pages.length - 1)];
  const active = physical?.page?.active || "white";
  useLayoutEffect(() => {
    const app = bar.current?.closest(".minimal-app");
    if (!app) return;
    const color =
      SCRIPT_VERSIONS.find(({ id }) => id === active) || SCRIPT_VERSIONS[0];
    app.dataset.mobilePageColor = active;
    app.style.setProperty("--mobile-page-hue", color.hue || 0);
    app.style.setProperty("--mobile-page-chroma", color.chroma || 0);
  }, [active]);
  if (!physical) return null;
  return (
    <div
      ref={bar}
      className="mobile-page-version-bar"
      data-page={physical.number}
      data-page-id={physical.page?.id}
    >
      <span
        className="mobile-page-number"
        aria-label={t("Страница {0}", physical.number)}
      >
        {physical.number}
      </span>
      <ScriptVersionPicker
        key={physical.page?.id}
        page={physical.page}
        pageNumber={physical.number}
        disabled={disabled || !physical.page}
        feedback
        onChange={(id) => onChange(id, physical.page?.id)}
      />
    </div>
  );
}
