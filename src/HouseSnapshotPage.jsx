import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import {
  HOUSE_ROOM,
  readHouseSnapshot,
  houseSnapshotFilename,
} from "./house-snapshot.js";

export default function HouseSnapshotPage() {
  useLanguage();
  const [snapshot, setSnapshot] = useState(() =>
    readHouseSnapshot(location.hash),
  );
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
        {snapshot ? (
          <>
            <img
              src={HOUSE_ROOM.image}
              width={HOUSE_ROOM.width}
              height={HOUSE_ROOM.height}
              alt={t("Снимок домика")}
            />
            <div className="house-snapshot-actions">
              <a
                className="house-photo-action"
                href={HOUSE_ROOM.image}
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
