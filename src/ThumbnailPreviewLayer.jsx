import { t, useLanguage, languageLocale } from "./i18n.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
export default function ThumbnailPreviewLayer({ components, props }) {
  const language = useLanguage();
  const [active, setActive] = useState(null);
  const [position, setPosition] = useState(null);
  const bubble = useRef(null);
  const records = useRef({
    components,
    props,
  });
  records.current = {
    components,
    props,
  };
  useEffect(() => {
    let timer;
    let target;
    const hide = () => {
      clearTimeout(timer);
      target = null;
      setActive(null);
      setPosition(null);
    };
    const resolve = (node) => {
      if (!(node instanceof Element)) return null;
      const image = node.closest('[data-thumbnail-preview="true"]');
      if (image)
        return {
          target: image,
          items: [
            {
              thumbnail: image.src,
              name: image.alt.replace(/^Миниатюра: /, ""),
            },
          ],
        };
      const anchor = node.closest(
        "[data-component-preview], [data-prop-preview], .screenplay-editor [data-entity-id], .screenplay-editor [data-prop-id]",
      );
      if (!anchor) return null;
      const componentId =
        anchor
          .closest("[data-component-preview], [data-entity-id]")
          ?.getAttribute("data-component-preview") ||
        anchor.closest("[data-entity-id]")?.getAttribute("data-entity-id") ||
        anchor
          .querySelector("[data-entity-id]")
          ?.getAttribute("data-entity-id");
      const propId =
        anchor
          .closest("[data-prop-preview], [data-prop-id]")
          ?.getAttribute("data-prop-preview") ||
        anchor.closest("[data-prop-id]")?.getAttribute("data-prop-id");
      const items = [
        records.current.components.find((item) => item.id === componentId),
        records.current.props.find((item) => item.id === propId),
      ].filter((item) => item?.thumbnail);
      return items.length
        ? {
            target: anchor,
            items,
          }
        : null;
    };
    const over = (event) => {
      if (event.pointerType !== "mouse") {
        hide();
        return;
      }
      const next = resolve(event.target);
      if (target === next?.target) return;
      hide();
      if (!next) return;
      target = next.target;
      timer = setTimeout(() => {
        if (target?.isConnected) setActive(next);
      }, 220);
    };
    const out = (event) => {
      if (resolve(event.relatedTarget)?.target !== target) hide();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);
  useEffect(() => {
    setActive(null);
    setPosition(null);
  }, [components, props]);
  useLayoutEffect(() => {
    if (!active || !bubble.current) return;
    const place = () => {
      const anchor = active.target.getBoundingClientRect();
      const box = bubble.current.getBoundingClientRect();
      const sidebar = active.target.closest("aside");
      let left = anchor.left + anchor.width / 2 - box.width / 2;
      let top = anchor.top - box.height - 12;
      if (sidebar && anchor.right + box.width + 20 <= window.innerWidth) {
        left = anchor.right + 12;
        top = anchor.top;
      } else if (top < 8) top = anchor.bottom + 12;
      left = Math.max(8, Math.min(window.innerWidth - box.width - 8, left));
      top = Math.max(8, Math.min(window.innerHeight - box.height - 8, top));
      setPosition({ left, top });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(bubble.current);
    return () => observer.disconnect();
  }, [active]);
  if (!active) return null;
  return createPortal(
    <div
      ref={bubble}
      className="thumbnail-preview"
      role="tooltip"
      aria-label={t("Миниатюра")}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {active.items.map((item, index) => (
        <figure key={index}>
          <img src={item.thumbnail} alt={item.name} />
          <figcaption>{item.name}</figcaption>
        </figure>
      ))}
    </div>,
    document.body,
  );
}
