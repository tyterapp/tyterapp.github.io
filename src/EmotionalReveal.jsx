import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
} from "react";
import "./emotional-reveal.css";

// Serega Emotional's sampled selector and property mapping:
// https://github.com/mishanaer/deslop/tree/main/serega/serega-emotional
const frames = Array.from({ length: 42 }, (_, index) => {
  const time = (index * 0.68) / 41;
  const spring = time - 0.18;
  const amount =
    index === 41
      ? 0
      : time < 0.18
        ? 1 - time / 0.18
        : ((-1 / 0.18) * Math.sin(spring * Math.PI * 2)) /
          (Math.exp(10 * spring) * Math.PI * 2);
  return {
    offset: index / 41,
    transform: `translateY(${32 * amount}px) rotate(${12 * amount}deg) scaleY(${1 - 0.22 * amount})`,
    opacity: Math.max(0, Math.min(1, 1 - amount)),
    filter: `blur(${10 * Math.max(0, amount)}px)`,
  };
});
const graphemes =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
const text = (nodes) =>
  Children.toArray(nodes)
    .map((node) =>
      typeof node === "string" || typeof node === "number"
        ? node
        : isValidElement(node)
          ? text(node.props.children)
          : "",
    )
    .join("");
function split(nodes) {
  return Children.map(nodes, (node) => {
    if (typeof node === "string" || typeof node === "number")
      return String(node)
        .match(/\S+\s*|\s+/gu)
        ?.map((word, index) => (
          <span className="emotional-word" key={index} aria-hidden="true">
            {(graphemes
              ? Array.from(graphemes.segment(word), (part) => part.segment)
              : Array.from(word)
            ).map((character, index) => (
              <span className="emotional-unit" key={index}>
                {character}
              </span>
            ))}
          </span>
        ));
    if (!isValidElement(node)) return node;
    if (typeof node.type !== "string")
      return (
        <span className="emotional-unit" aria-hidden="true">
          {node}
        </span>
      );
    return cloneElement(node, {
      ...(["p", "h2"].includes(node.type)
        ? {
            "data-emotional-block": true,
            "aria-label": text(node.props.children),
          }
        : {}),
      children: split(node.props.children),
    });
  });
}
export default function EmotionalReveal({ children, language, ...props }) {
  const root = useRef(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animations = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const units = entry.target.querySelectorAll(".emotional-unit");
          // Preserve the expressive motion on long onboarding copy without
          // withholding the final lines for tens of seconds.
          const stagger = Math.min(25, 1800 / Math.max(1, units.length));
          units.forEach((unit, index) => {
            const animation = unit.animate(frames, {
              delay: (index + 1) * stagger,
              duration: 680,
              easing: "linear",
              fill: "both",
            });
            animations.add(animation);
            animation.finished
              .then(() => {
                animation.cancel();
                animations.delete(animation);
              })
              .catch(() => {});
          });
        }
      },
      { threshold: 0.1 },
    );
    root.current
      .querySelectorAll("[data-emotional-block]")
      .forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
    };
  }, [language]);
  return (
    <section ref={root} {...props}>
      {split(children)}
    </section>
  );
}
