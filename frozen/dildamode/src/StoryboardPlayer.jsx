import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Play, Pause, X } from "lucide-react";
import { getLanguage, useLanguage } from "./i18n.js";
import { storyboardFrames, frameDuration } from "./storyboard-data.js";
import { shotAspectRatio } from "./shot-image.js";
const tr = (ru, en) => (getLanguage() === "en" ? en : ru);
export default function StoryboardPlayer({ scenes, page, onClose }) {
  useLanguage();
  const dialog = useRef(null);
  const [activePage, setActivePage] = useState(page);
  const pages = [...new Set(scenes.map((scene) => scene.page))].sort(
    (a, b) => a - b,
  );
  const pageIndex = pages.indexOf(activePage);
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false);
  const frames = scenes
    .filter((scene) => scene.page === activePage)
    .flatMap((scene) =>
      storyboardFrames(scene.settings)
        .filter((frame) => frame.image)
        .map((frame) => ({ scene, frame })),
    );
  const current = frames[index];
  const changePage = (direction) => {
    const next = pages[pageIndex + direction];
    if (next === undefined) return;
    setActivePage(next);
    setIndex(0);
    setPaused(false);
  };
  const step = (direction) => {
    setIndex((value) =>
      Math.max(0, Math.min(frames.length - 1, value + direction)),
    );
    setPaused(true);
  };
  const toggle = () => {
    if (paused && index === frames.length - 1) setIndex(0);
    setPaused(!paused);
  };
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    if (paused || !current) return;
    const timer = setTimeout(() => {
      if (index === frames.length - 1) setPaused(true);
      else setIndex(index + 1);
    }, frameDuration(current.frame.durationMs));
    return () => clearTimeout(timer);
  }, [
    index,
    paused,
    current?.frame.id,
    current?.frame.durationMs,
    frames.length,
  ]);
  return (
    <dialog
      className="story-player"
      ref={dialog}
      aria-label={tr(
        `Проигрыватель страницы ${activePage}`,
        `Page ${activePage} player`,
      )}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
      onKeyDown={(event) => {
        if (
          event.target.closest("button") &&
          ["Enter", " "].includes(event.key)
        )
          return;
        if (event.code === "Space") {
          event.preventDefault();
          toggle();
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          step(1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          step(-1);
        }
        if (["PageUp", "PageDown"].includes(event.key)) {
          event.preventDefault();
          changePage(event.key === "PageUp" ? -1 : 1);
        }
      }}
    >
      <button
        className="story-player-page previous"
        aria-label={tr("Предыдущая страница", "Previous page")}
        disabled={pageIndex <= 0}
        onClick={() => changePage(-1)}
      >
        <ArrowLeft size={22} />
      </button>
      <button
        className="story-player-page next"
        aria-label={tr("Следующая страница", "Next page")}
        disabled={pageIndex >= pages.length - 1}
        onClick={() => changePage(1)}
      >
        <ArrowRight size={22} />
      </button>
      <header>
        <span>
          {tr("Страница", "Page")} {activePage}
          {current
            ? ` · ${tr("Сцена", "Scene")} ${current.scene.number} ${current.scene.letter}`
            : ""}
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={tr("Закрыть проигрыватель", "Close player")}
        >
          <X size={20} />
        </button>
      </header>
      <div
        className="story-player-image"
        style={{
          aspectRatio:
            shotAspectRatio(current?.scene.settings.aspectRatio) || 16 / 9,
        }}
      >
        {current && (
          <img
            key={`${current.scene.id}:${current.frame.id}`}
            src={current.frame.image}
            className={
              current.frame.transition === "fade" ? "story-image-fade" : ""
            }
            alt={`${tr("Сцена", "Scene")} ${current.scene.number} ${current.scene.letter}`}
          />
        )}
        {!current && (
          <p>
            {tr(
              "На этой странице пока нет кадров",
              "No frames on this page yet",
            )}
          </p>
        )}
      </div>
      <div className="story-player-caption">{current?.scene.title}</div>
      <footer>
        <button
          className="icon-button"
          aria-label={tr("Предыдущий кадр", "Previous frame")}
          disabled={!index}
          onClick={() => step(-1)}
        >
          <ArrowLeft size={20} />
        </button>
        <button
          className="icon-button story-player-play"
          disabled={!frames.length}
          aria-label={
            paused
              ? tr("Продолжить воспроизведение", "Resume playback")
              : tr("Приостановить воспроизведение", "Pause playback")
          }
          onClick={toggle}
        >
          {paused ? (
            <Play size={22} fill="currentColor" />
          ) : (
            <Pause size={22} />
          )}
        </button>
        <button
          className="icon-button"
          aria-label={tr("Следующий кадр", "Next frame")}
          disabled={index >= frames.length - 1}
          onClick={() => step(1)}
        >
          <ArrowRight size={20} />
        </button>
        <output>
          {frames.length ? index + 1 : 0} / {frames.length}
        </output>
      </footer>
    </dialog>
  );
}
