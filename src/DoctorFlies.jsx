import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { doctorCondition } from "./script-doctor.js";

function Fly({ index }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current,
      reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let timer,
      crawl,
      disposed = false;
    const clamp = (point) => {
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0,
        top = viewport?.offsetTop || 0;
      return {
        ...point,
        x: Math.max(
          left + 6,
          Math.min(left + (viewport?.width || innerWidth) - 12, point.x),
        ),
        y: Math.max(
          top + 6,
          Math.min(top + (viewport?.height || innerHeight) - 12, point.y),
        ),
      };
    };
    const surfaces = [
      ...document.querySelectorAll(
        ".minimal-header button, .script-paper, .outline-card, .drawer-heading, .screenplay-format-bar",
      ),
    ]
      .map((element) => element.getBoundingClientRect())
      .filter(
        (box) =>
          box.width &&
          box.height &&
          box.bottom > 0 &&
          box.right > 0 &&
          box.left < innerWidth &&
          box.top < innerHeight,
      );
    const surface = surfaces[Math.floor(Math.random() * surfaces.length)];
    let point = clamp({
      x: surface
        ? surface.left + Math.random() * surface.width
        : Math.random() * innerWidth,
      y: surface
        ? surface.top + Math.random() * surface.height
        : Math.random() * innerHeight,
      angle: Math.random() * 360,
    });
    const transform = (p) =>
      `translate(${p.x}px, ${p.y}px) rotate(${p.angle}deg)`;
    node.style.transform = transform(point);
    const move = () => {
      if (disposed || document.hidden || reduce.matches) return;
      const heading =
        ((point.angle - 90 + (Math.random() - 0.5) * 160) * Math.PI) / 180;
      const distance = 12 + Math.random() * 24;
      const target = clamp({
        x: point.x + Math.cos(heading) * distance,
        y: point.y + Math.sin(heading) * distance,
        angle: point.angle,
      });
      const bearing =
        (Math.atan2(target.y - point.y, target.x - point.x) * 180) / Math.PI +
        90;
      target.angle =
        point.angle +
        ((((bearing - point.angle + 180) % 360) + 360) % 360) -
        180;
      // Short steps on the surface, without airborne arcs or distant jumps.
      crawl = node.animate(
        [{ transform: transform(point) }, { transform: transform(target) }],
        {
          duration: 1800 + Math.random() * 2600,
          easing: "linear",
          fill: "forwards",
        },
      );
      crawl.onfinish = () => {
        point = target;
        node.style.transform = transform(point);
        crawl.cancel();
        crawl = null;
        timer = setTimeout(move, 400 + Math.random() * 1600);
      };
    };
    const reset = () => {
      clearTimeout(timer);
      // Capture an interrupted step so resuming never jumps back to its start.
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      point = clamp({
        x: matrix.m41,
        y: matrix.m42,
        angle: (Math.atan2(matrix.m12, matrix.m11) * 180) / Math.PI,
      });
      crawl?.cancel();
      crawl = null;
      node.style.transform = transform(point);
      if (!document.hidden && !reduce.matches)
        timer = setTimeout(move, index * 120);
    };
    if (!reduce.matches) timer = setTimeout(move, index * 180);
    document.addEventListener("visibilitychange", reset);
    reduce.addEventListener("change", reset);
    window.addEventListener("resize", reset);
    window.visualViewport?.addEventListener("resize", reset);
    return () => {
      disposed = true;
      clearTimeout(timer);
      crawl?.cancel();
      document.removeEventListener("visibilitychange", reset);
      reduce.removeEventListener("change", reset);
      window.removeEventListener("resize", reset);
      window.visualViewport?.removeEventListener("resize", reset);
    };
  }, [index]);
  return (
    <svg
      ref={ref}
      className="doctor-interface-fly"
      data-movement="crawl"
      viewBox="0 0 10 10"
      width="9"
      height="9"
      aria-hidden="true"
    >
      <ellipse
        className="doctor-interface-wing"
        cx="3"
        cy="4"
        rx="1.3"
        ry="1.3"
        transform="rotate(-30 3 4)"
      />
      <ellipse
        className="doctor-interface-wing"
        cx="7"
        cy="4"
        rx="1.3"
        ry="1.3"
        transform="rotate(30 7 4)"
      />
      <path
        d="M4 4 2 3M6 4 8 3M4 6 1.5 6M6 6 8.5 6M4 7.5 2 9M6 7.5 8 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.7"
      />
      <ellipse cx="5" cy="6" rx="1.2" ry="2" />
      <circle cx="5" cy="3.5" r="1.1" />
    </svg>
  );
}
export default function DoctorFlies({
  count,
  suppressed = false,
  resetToken = 0,
}) {
  const ref = useRef(null),
    { flies } = doctorCondition(count);
  const [regenerated, setRegenerated] = useState(flies);
  const regenerationStart = useRef(null);
  useEffect(() => {
    if (suppressed) {
      regenerationStart.current = null;
      setRegenerated(0);
      return;
    }
    if (!resetToken) {
      setRegenerated(flies);
      return;
    }
    regenerationStart.current ??= Date.now();
    let interval;
    const tick = () => {
      const restored = Math.min(
        flies,
        Math.floor((Date.now() - regenerationStart.current) / 3000),
      );
      setRegenerated(restored);
      if (restored === flies) clearInterval(interval);
      return restored;
    };
    const restored = tick();
    if (restored < flies) interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [flies, suppressed, resetToken]);
  const visible = suppressed ? 0 : Math.min(flies, regenerated);
  useEffect(() => {
    const node = ref.current;
    if (!node || !visible || !node.showPopover) return;
    node.showPopover();
    const top = (event) => {
      if (
        event.target.tagName === "DIALOG" &&
        event.newState === "open" &&
        node.isConnected
      ) {
        node.hidePopover();
        node.showPopover();
      }
    };
    document.addEventListener("toggle", top, true);
    return () => {
      document.removeEventListener("toggle", top, true);
      if (node.matches(":popover-open")) node.hidePopover();
    };
  }, [visible]);
  if (!visible) return null;
  return createPortal(
    <div
      ref={ref}
      popover="manual"
      className="doctor-interface-flies"
      aria-hidden="true"
    >
      {Array.from({ length: visible }, (_, index) => (
        <Fly key={index} index={index} />
      ))}
    </div>,
    document.body,
  );
}
