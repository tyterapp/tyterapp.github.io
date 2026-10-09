import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { doctorCondition } from "./script-doctor.js";

function Fly({ index }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current,
      reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let timer,
      flight,
      disposed = false;
    let point = { x: 12 + index * 19, y: 80 };
    const land = () => {
      const candidates = [
        ...document.querySelectorAll(
          ".minimal-header button, .script-paper, .outline-card, .drawer-heading, .screenplay-format-bar",
        ),
      ]
        .map((element) => element.getBoundingClientRect())
        .filter(
          (box) =>
            box.width &&
            box.height &&
            box.top >= 0 &&
            box.left < innerWidth &&
            box.top < innerHeight,
        );
      const box = candidates[Math.floor(Math.random() * candidates.length)];
      const viewport = window.visualViewport;
      return {
        x: Math.max(
          6,
          Math.min(
            innerWidth - 12,
            box
              ? box.left + Math.random() * box.width
              : Math.random() * innerWidth,
          ),
        ),
        y: Math.max(
          (viewport?.offsetTop || 0) + 6,
          Math.min(
            (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 12,
            box
              ? Math.random() < 0.5
                ? box.top
                : box.bottom
              : Math.random() * innerHeight,
          ),
        ),
      };
    };
    const transform = (p) => `translate(${p.x}px, ${p.y}px)`;
    const move = () => {
      if (disposed || document.hidden) return;
      const target = land();
      if (reduce.matches) {
        node.style.transform = transform(target);
        return;
      }
      flight = node.animate(
        [
          { transform: transform(point) },
          {
            transform: transform({
              x: (point.x + target.x) / 2,
              y: Math.max(6, (point.y + target.y) / 2 - 35),
            }),
          },
          { transform: transform(target) },
        ],
        {
          duration: 9000 + Math.random() * 7000,
          easing: "ease-in-out",
          fill: "forwards",
        },
      );
      flight.onfinish = () => {
        point = target;
        node.style.transform = transform(point);
        flight.cancel();
        timer = setTimeout(move, 5000 + Math.random() * 11000);
      };
    };
    const visibility = () => {
      clearTimeout(timer);
      flight?.cancel();
      if (!document.hidden) timer = setTimeout(move, index * 300);
    };
    timer = setTimeout(move, index * 450);
    document.addEventListener("visibilitychange", visibility);
    reduce.addEventListener("change", visibility);
    return () => {
      disposed = true;
      clearTimeout(timer);
      flight?.cancel();
      document.removeEventListener("visibilitychange", visibility);
      reduce.removeEventListener("change", visibility);
    };
  }, [index]);
  return (
    <svg
      ref={ref}
      className="doctor-interface-fly"
      viewBox="0 0 10 10"
      width="9"
      height="9"
      aria-hidden="true"
    >
      <ellipse
        className="doctor-interface-wing"
        cx="3"
        cy="4"
        rx="2.4"
        ry="1.3"
        transform="rotate(-30 3 4)"
      />
      <ellipse
        className="doctor-interface-wing"
        cx="7"
        cy="4"
        rx="2.4"
        ry="1.3"
        transform="rotate(30 7 4)"
      />
      <ellipse cx="5" cy="6" rx="1.2" ry="2" />
      <circle cx="5" cy="3.5" r="1.1" />
    </svg>
  );
}
export default function DoctorFlies({ count, iconVisible = true }) {
  const ref = useRef(null),
    { flies } = doctorCondition(count);
  const visible =
    flies - (iconVisible ? Math.min(3, Math.floor(flies / 3)) : 0);
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
