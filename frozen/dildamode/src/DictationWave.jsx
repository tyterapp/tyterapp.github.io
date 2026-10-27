import { useEffect, useRef } from "react";

export default function DictationWave({ sample }) {
  const ref = useRef(null);
  useEffect(() => {
    const svg = ref.current,
      bars = [...svg.querySelectorAll("rect")];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame,
      last = 0,
      level = 0;
    const draw = (time) => {
      if (time - last >= 48) {
        last = time;
        const next = sample();
        level += (next - level) * (next > level ? 0.65 : 0.4);
        svg.dataset.speaking = level > 0.035 ? "true" : "false";
        bars.forEach((bar, index) => {
          const height =
            3 + level * 23 * (0.55 + Math.sin(time / 95 + index * 0.8) * 0.25);
          bar.setAttribute("height", height.toFixed(2));
          bar.setAttribute("y", ((28 - height) / 2).toFixed(2));
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [sample]);
  return (
    <svg
      ref={ref}
      className="writing-radio-wave"
      viewBox="0 0 56 28"
      aria-hidden="true"
      data-speaking="false"
    >
      {Array.from({ length: 7 }, (_, index) => (
        <rect
          key={index}
          x={5 + index * 7}
          y="12.5"
          width="4"
          height="3"
          rx="2"
        />
      ))}
    </svg>
  );
}
