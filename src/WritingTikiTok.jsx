import { useEffect, useRef, useState } from "react";
import { Pause, Play, RefreshCw, Volume2, VolumeX, X } from "lucide-react";
import { useLanguage } from "./i18n.js";

export const TIKITOK_VIDEO = `${import.meta.env.BASE_URL}tikitok/video.mp4`;

export default function WritingTikiTok({ closing, onClose }) {
  const language = useLanguage();
  const text = (ru, en) => (language === "en" ? en : ru);
  const videoRef = useRef(null),
    closeRef = useRef(null);
  const [playing, setPlaying] = useState(false),
    [muted, setMuted] = useState(true),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    closeRef.current?.focus({ preventScroll: true });
    video.src = TIKITOK_VIDEO;
    video.play().catch(() => {});
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);
  useEffect(() => {
    if (closing) videoRef.current?.pause();
  }, [closing]);
  const playbackLabel = failed
    ? text("Повторить TikiTok", "Retry TikiTok")
    : playing
      ? text("Приостановить TikiTok", "Pause TikiTok")
      : text("Воспроизвести TikiTok", "Play TikiTok");
  const soundLabel = muted
    ? text("Включить звук TikiTok", "Unmute TikiTok")
    : text("Выключить звук TikiTok", "Mute TikiTok");
  return (
    <aside
      id="writing-tikitok"
      className={`writing-tikitok${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-label="TikiTok"
      aria-modal="false"
    >
      <header className="writing-shop-header">
        <strong>TikiTok</strong>
        <div className="writing-house-actions">
          <button
            type="button"
            className="writing-timer-button"
            aria-label={playbackLabel}
            data-tooltip={playbackLabel}
            disabled={closing}
            onClick={() => {
              const video = videoRef.current;
              if (failed) {
                setFailed(false);
                video.src = TIKITOK_VIDEO;
              }
              if (video.paused) video.play().catch(() => {});
              else video.pause();
            }}
          >
            {failed ? (
              <RefreshCw size={18} aria-hidden="true" />
            ) : playing ? (
              <Pause size={18} aria-hidden="true" />
            ) : (
              <Play size={18} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="writing-timer-button"
            aria-label={soundLabel}
            data-tooltip={soundLabel}
            aria-pressed={!muted}
            disabled={closing}
            onClick={() => setMuted((value) => !value)}
          >
            {muted ? (
              <VolumeX size={18} aria-hidden="true" />
            ) : (
              <Volume2 size={18} aria-hidden="true" />
            )}
          </button>
          <button
            ref={closeRef}
            type="button"
            className="writing-timer-button"
            aria-label={text("Закрыть TikiTok", "Close TikiTok")}
            onClick={() => {
              videoRef.current?.pause();
              onClose();
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
      <video
        ref={videoRef}
        className="writing-tikitok-video"
        aria-label="TikiTok"
        loop
        playsInline
        muted={muted}
        preload="metadata"
        disablePictureInPicture
        disableRemotePlayback
        onPlaying={(event) => {
          if (closing) event.currentTarget.pause();
          else {
            setPlaying(true);
            setFailed(false);
          }
        }}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setFailed(true);
        }}
      />
    </aside>
  );
}
