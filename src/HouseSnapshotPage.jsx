import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import {
  HOUSE_ROOM,
  readHouseSnapshot,
  houseSnapshotFilename,
  captureHouseSnapshot,
} from "./house-snapshot.js";

export default function HouseSnapshotPage() {
  useLanguage();
  const [snapshot, setSnapshot] = useState(() =>
    readHouseSnapshot(location.hash),
  );
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(false);
  const imageUrl = preview?.snapshot === snapshot ? preview.url : null;
  const pending = !!snapshot?.skin && !imageUrl;
  useEffect(() => {
    setError(false);
    if (!snapshot?.skin) return;
    let cancelled = false,
      url;
    const image = new Image();
    image.src = HOUSE_ROOM.image;
    captureHouseSnapshot(image, snapshot.takenAt, {
      skin: snapshot.skin,
      frame: snapshot.frame,
    })
      .then(({ blob }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreview({ snapshot, url });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [snapshot]);
  useEffect(() => {
    document.title = `${t("Снимок домика")} — Tyter · OiiA`;
    const update = () => setSnapshot(readHouseSnapshot(location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return (
    <main className="house-snapshot-page">
      <section className="house-snapshot-card" aria-label={t("Снимок домика")}>
        <header>
          <h1>{t("Снимок домика")}</h1>
          <a className="house-snapshot-brand" href="/">
            Tyter · OiiA
          </a>
        </header>
        {snapshot && !error ? (
          <>
            {pending && <p role="status">{t("Создаём снимок…")}</p>}
            <img
              src={imageUrl || HOUSE_ROOM.image}
              width={HOUSE_ROOM.width}
              height={HOUSE_ROOM.height}
              alt={t("Снимок домика")}
            />
            <div className="house-snapshot-actions">
              <a
                className="house-photo-action"
                href={imageUrl || HOUSE_ROOM.image}
                aria-disabled={pending || undefined}
                onClick={
                  pending ? (event) => event.preventDefault() : undefined
                }
                download={houseSnapshotFilename(snapshot)}
              >
                <Download size={18} aria-hidden="true" />
                {t("Скачать PNG")}
              </a>
              <a className="house-photo-action" href="/free">
                {t("Попробовать бесплатно")}
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            </div>
          </>
        ) : (
          <p className="house-snapshot-error" role="alert">
            {t(
              "Снимок не найден. Проверьте, что ссылка скопирована полностью.",
            )}
          </p>
        )}
      </section>
    </main>
  );
}
