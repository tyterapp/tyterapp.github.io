import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { animateBurningPaper } from "./burning-paper-webgl.js";
import "./burning-paper.css";

// Paint directly over the affected sheet, without a dialog or additional UI.
export default function BurningPaper({ burn, onDone }) {
  const layer = useRef(null),
    canvas = useRef(null),
    done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const node = layer.current,
      surface = canvas.current;
    const { paper, scroller } = burn;
    const previousMask = paper.style.maskImage;
    let region = burn.region,
      animation,
      timeout,
      frame,
      disposed = false,
      committed = false;
    const fit = () => {
      const bounds = paper.getBoundingClientRect(),
        clip = scroller.getBoundingClientRect();
      const scale = bounds.width / paper.offsetWidth || 1;
      Object.assign(node.style, {
        left: `${clip.left}px`,
        top: `${clip.top}px`,
        width: `${scroller.clientWidth}px`,
        height: `${scroller.clientHeight}px`,
      });
      Object.assign(surface.style, {
        left: `${bounds.left - clip.left}px`,
        top: `${bounds.top - clip.top + region.top * scale}px`,
        width: `${bounds.width}px`,
        height: `${region.height * scale}px`,
      });
    };
    const mask = () => {
      paper.style.maskImage = `linear-gradient(to bottom, #000 0px, #000 ${region.top}px, transparent ${region.top}px)`;
    };
    const bounds = paper.getBoundingClientRect(),
      clip = scroller.getBoundingClientRect();
    const scale = bounds.width / paper.offsetWidth || 1;
    scroller.scrollTop += bounds.top + region.top * scale - clip.top - 24;
    fit();
    mask();
    scroller.addEventListener("scroll", fit, { passive: true });
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    const observer = new ResizeObserver(fit);
    observer.observe(paper);
    const finish = () => {
      if (!disposed) done.current();
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveal = () => {
      // Let React and pagination settle before revealing the new empty sheet.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (disposed) return;
          const texture = burn.resetTexture();
          const bounds = paper.getBoundingClientRect();
          region = {
            top: 0,
            height: bounds.height / (bounds.width / paper.offsetWidth || 1),
          };
          mask();
          fit();
          node.dataset.phase = "dissolve";
          if (animation) animation.reveal(texture, finish);
          else {
            surface.style.backgroundImage = `url(${texture.toDataURL()})`;
            surface.className = "burning-paper-canvas burning-paper-reveal";
            timeout = setTimeout(finish, reduced ? 160 : 700);
          }
        });
      });
    };
    const burned = () => {
      if (disposed || committed) return;
      committed = true;
      try {
        if (!burn.commit()) {
          finish();
          return;
        }
        if (burn.single) reveal();
        else finish();
      } catch {
        finish();
      }
    };
    animation = reduced
      ? null
      : animateBurningPaper(surface, burn.texture, burned);
    if (animation) node.dataset.renderer = "webgl";
    else {
      node.dataset.renderer = reduced ? "reduced-motion" : "fallback";
      surface.style.backgroundImage = `url(${burn.texture.toDataURL()})`;
      surface.classList.add(
        reduced ? "burning-paper-reduced" : "burning-paper-fallback",
      );
      timeout = setTimeout(burned, reduced ? 180 : 1200);
    }
    return () => {
      disposed = true;
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
      animation?.dispose();
      paper.style.maskImage = previousMask;
      observer.disconnect();
      scroller.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
    };
  }, [burn]);
  return createPortal(
    <div
      ref={layer}
      className="burning-paper-layer"
      data-phase="burn"
      aria-hidden="true"
    >
      <canvas ref={canvas} className="burning-paper-canvas" />
    </div>,
    document.body,
  );
}
