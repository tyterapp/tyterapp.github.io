import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { t } from "./i18n.js";
import { animateBurningPaper } from "./burning-paper-webgl.js";
import "./burning-paper.css";

export default function BurningPaper({ burn, onDone }) {
  const dialog = useRef(null),
    canvas = useRef(null),
    done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const node = dialog.current,
      surface = canvas.current;
    node.showModal();
    const viewport = window.visualViewport;
    const fit = () => {
      const height = viewport?.height || window.innerHeight;
      node.style.height = `${height}px`;
      node.style.top = `${viewport?.offsetTop || 0}px`;
      node.style.setProperty(
        "--burn-canvas-height",
        `${Math.max(24, height - 128)}px`,
      );
    };
    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    let completed = false;
    const finish = () => {
      if (!completed) {
        completed = true;
        done.current();
      }
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanup = reduced
      ? null
      : animateBurningPaper(surface, burn.texture, finish);
    let timeout;
    if (cleanup) node.dataset.renderer = "webgl";
    else {
      node.dataset.renderer = reduced ? "reduced-motion" : "fallback";
      // WebGL may be blocked: keep the page visible without requiring a GPU.
      surface.style.backgroundImage = `url(${burn.texture.toDataURL()})`;
      surface.classList.add(
        reduced ? "burning-paper-still" : "burning-paper-fallback",
      );
      timeout = setTimeout(finish, reduced ? 400 : 1200);
    }
    return () => {
      completed = true;
      clearTimeout(timeout);
      cleanup?.();
      node.close();
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
    };
  }, [burn]);
  return createPortal(
    <dialog
      ref={dialog}
      className="burning-paper-dialog"
      aria-label={t("Сжигание последней страницы")}
      onCancel={(event) => {
        event.preventDefault();
        done.current();
      }}
    >
      <div className="burning-paper-content">
        <p role="status">{t("Сжигаем страницу {0}", burn.page)}</p>
        <canvas
          ref={canvas}
          className="burning-paper-canvas"
          style={{
            aspectRatio: `${burn.texture.width} / ${burn.texture.height}`,
            "--burn-aspect": burn.texture.width / burn.texture.height,
          }}
          aria-hidden="true"
        />
        <button
          type="button"
          className="quiet-button"
          autoFocus
          onClick={() => done.current()}
        >
          {t("Пропустить анимацию")}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
