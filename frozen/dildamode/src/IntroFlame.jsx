import { useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";

// A small monochrome Lottie matches the interface's 1.5px outline icons.
const outline = {
  i: [
    [0, 0],
    [1, -2],
    [1, -1],
    [0, -3],
    [-3, 0],
    [0, 3],
    [-1, 1],
    [0, 0],
    [0, 2],
    [1, -1],
    [0, 0],
  ],
  o: [
    [-1, 3],
    [-1, 1],
    [-1, 1],
    [0, 3],
    [3, 0],
    [0, -2],
    [-1, 1],
    [0, -2],
    [0, -2],
    [-1, 1],
    [0, -2],
  ],
  v: [
    [12, 2],
    [10, 7],
    [7, 10],
    [5, 14],
    [12, 21],
    [19, 14],
    [17, 8],
    [15, 12],
    [12, 15],
    [10, 12],
    [12, 2],
  ],
  c: true,
};
const flame = {
  v: "5.12.2",
  fr: 30,
  ip: 0,
  op: 45,
  w: 24,
  h: 24,
  nm: "Tyter flame",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "Flame outline",
      sr: 1,
      ip: 0,
      op: 45,
      st: 0,
      bm: 0,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [12, 20, 0] },
        a: { a: 0, k: [12, 20, 0] },
        s: {
          a: 1,
          k: [
            {
              t: 0,
              s: [100, 100, 100],
              e: [94, 105, 100],
              i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] },
              o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] },
            },
            {
              t: 15,
              s: [94, 105, 100],
              e: [103, 97, 100],
              i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] },
              o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] },
            },
            {
              t: 30,
              s: [103, 97, 100],
              e: [100, 100, 100],
              i: { x: [0.5, 0.5, 0.5], y: [1, 1, 1] },
              o: { x: [0.5, 0.5, 0.5], y: [0, 0, 0] },
            },
            { t: 45, s: [100, 100, 100] },
          ],
        },
      },
      shapes: [
        { ty: "sh", ks: { a: 0, k: outline }, nm: "Outline" },
        {
          ty: "st",
          c: { a: 0, k: [0.6, 0.57, 0.65, 1] },
          o: { a: 0, k: 100 },
          w: { a: 0, k: 1.5 },
          lc: 2,
          lj: 2,
          nm: "UI stroke",
        },
      ],
    },
  ],
};

export default function IntroFlame() {
  const host = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stopped = false,
      animation;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      motion.matches ? animation?.goToAndStop(0, true) : animation?.play();
    import("lottie-web/build/player/lottie_light")
      .then((module) => {
        if (stopped || !host.current) return;
        animation = (module.default || module).loadAnimation({
          container: host.current,
          renderer: "svg",
          loop: true,
          autoplay: !motion.matches,
          animationData: structuredClone(flame),
          rendererSettings: { progressiveLoad: false },
        });
        animation.addEventListener("DOMLoaded", () => {
          if (!stopped) setReady(true);
        });
        if (animation.isLoaded) setReady(true);
      })
      .catch(() => {});
    motion.addEventListener("change", update);
    return () => {
      stopped = true;
      motion.removeEventListener("change", update);
      animation?.destroy();
    };
  }, []);
  return (
    <span
      className={`intro-flame${ready ? " is-ready" : ""}`}
      aria-hidden="true"
    >
      <Flame size={18} className="intro-flame-fallback" />
      <span ref={host} className="intro-flame-player" />
    </span>
  );
}
