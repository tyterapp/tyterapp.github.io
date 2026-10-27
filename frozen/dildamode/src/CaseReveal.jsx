import { createContext, useContext, useEffect, useRef, useState } from "react";
import EmotionalReveal from "./EmotionalReveal.jsx";

const Scrolled = createContext(false);
export function CaseMotion({ children }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const scroll = () => setScrolled(true);
    window.addEventListener("scroll", scroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", scroll, true);
  }, []);
  return <Scrolled.Provider value={scrolled}>{children}</Scrolled.Provider>;
}

// Keep the initial view readable. Start once, only after a scroll and when
// this particular heading enters the viewport; paragraphs remain untouched.
export default function CaseReveal({ children, language }) {
  const scrolled = useContext(Scrolled);
  const ref = useRef(null);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (
      !scrolled ||
      started ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [scrolled, started]);
  return (
    <div ref={ref} className="case-reveal" data-revealed={started}>
      {started ? (
        <EmotionalReveal as="div" language={language}>
          {children}
        </EmotionalReveal>
      ) : (
        children
      )}
    </div>
  );
}
