import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { t } from "./i18n.js";
import { cleanShotLocation, shotLocationLabel } from "./shot-info.js";
import "./shot-location.css";

const coordinate = (value) => (value == null ? "" : value.toFixed(6));
const parseCoordinate = (value) => {
  const input = String(value).trim().replace(",", ".");
  return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input) ? Number(input) : NaN;
};

export default function ShotLocationPicker({ value, onChange }) {
  const container = useRef(null),
    runtime = useRef(null);
  const latest = useRef({ value, onChange, name: value?.name || "" });
  const [latitude, setLatitude] = useState(coordinate(value?.latitude));
  const [longitude, setLongitude] = useState(coordinate(value?.longitude));
  const [name, setName] = useState(value?.name || "");
  const [error, setError] = useState("");
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [ready, setReady] = useState(false);
  latest.current = { value, onChange, name };

  const choose = (lat, lng) => {
    const location = cleanShotLocation({
      latitude: lat,
      longitude: lng,
      name: latest.current.name,
    });
    if (!location) {
      setError(t("Широта: от −90 до 90. Долгота: от −180 до 180."));
      return;
    }
    setError("");
    latest.current.onChange(location);
  };

  useEffect(() => {
    let cancelled = false,
      current = null,
      observer = null;
    // Maps are loaded only while this property is expanded; there is no prefetch.
    Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")])
      .then(([module]) => {
        if (cancelled || !container.current) return;
        const L = module.default || module;
        const selected = latest.current.value;
        const map = L.map(container.current, {
          center: selected ? [selected.latitude, selected.longitude] : [30, 0],
          zoom: selected ? 13 : 2,
          minZoom: 1,
          maxZoom: 19,
          scrollWheelZoom: false,
          keyboard: true,
          fadeAnimation: false,
          zoomAnimation: !matchMedia("(prefers-reduced-motion: reduce)")
            .matches,
        });
        current = { L, map, marker: null };
        runtime.current = current;
        map.attributionControl.setPrefix(false);
        const tiles = L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            keepBuffer: 0,
            updateWhenIdle: true,
            referrerPolicy: "strict-origin-when-cross-origin",
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
          },
        );
        tiles.on("tileerror", () => {
          if (!cancelled) setMapUnavailable(true);
        });
        tiles.on("tileload", () => {
          if (!cancelled) setMapUnavailable(false);
        });
        tiles.addTo(map);
        map.on("click", ({ latlng }) => {
          const point = latlng.wrap();
          choose(point.lat, point.lng);
        });
        if (selected) {
          current.marker = L.circleMarker(
            [selected.latitude, selected.longitude],
            {
              radius: 8,
              weight: 3,
              color: "#ffffff",
              fillColor: "#65597d",
              fillOpacity: 1,
            },
          ).addTo(map);
        }
        observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
        observer.observe(container.current);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setMapUnavailable(true);
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      current?.map.remove();
      if (runtime.current === current) runtime.current = null;
    };
  }, []);

  useEffect(() => {
    setLatitude(coordinate(value?.latitude));
    setLongitude(coordinate(value?.longitude));
    const current = runtime.current;
    if (!current) return;
    if (!value) {
      current.marker?.remove();
      current.marker = null;
      return;
    }
    const point = [value.latitude, value.longitude];
    if (current.marker) current.marker.setLatLng(point);
    else
      current.marker = current.L.circleMarker(point, {
        radius: 8,
        weight: 3,
        color: "#ffffff",
        fillColor: "#65597d",
        fillOpacity: 1,
      }).addTo(current.map);
    current.map.panTo(point, { animate: false });
  }, [value?.latitude, value?.longitude, ready]);

  const chooseCenter = () => {
    const point = runtime.current?.map.getCenter().wrap();
    if (point) choose(point.lat, point.lng);
  };
  const applyCoordinates = () => {
    choose(parseCoordinate(latitude), parseCoordinate(longitude));
  };
  return (
    <div className="shot-location-picker">
      <div className="shot-location-map-frame">
        <div
          className="shot-location-map"
          ref={container}
          role="region"
          aria-label={t("Карта локации съёмок")}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target === container.current) {
              event.preventDefault();
              chooseCenter();
            }
          }}
        />
        <span className="shot-location-crosshair" aria-hidden="true">
          +
        </span>
      </div>
      <small className="shot-help">
        {t("Нажмите на карту. Стрелки перемещают карту, Enter выбирает центр.")}
      </small>
      {mapUnavailable && (
        <p className="shot-help" role="status">
          {t("Карта недоступна. Локацию можно задать координатами.")}
        </p>
      )}
      <button
        className="quiet-button shot-location-center"
        type="button"
        disabled={!ready}
        onClick={chooseCenter}
      >
        <MapPin size={15} aria-hidden="true" />
        {t("Выбрать центр карты")}
      </button>
      <label className="shot-location-label">
        {t("Название локации")}
        <input
          className="shot-name-input"
          value={name}
          maxLength={180}
          placeholder={t("Например, кафе у вокзала")}
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            if (value) onChange({ ...value, name: next });
          }}
        />
      </label>
      <div className="shot-location-coordinates">
        {[
          [t("Широта"), latitude, setLatitude],
          [t("Долгота"), longitude, setLongitude],
        ].map(([label, coordinate, update]) => (
          <label className="shot-location-label" key={label}>
            {label}
            <input
              className="shot-name-input"
              inputMode="decimal"
              value={coordinate}
              onChange={(event) => update(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyCoordinates();
                }
              }}
            />
          </label>
        ))}
      </div>
      {error && (
        <p className="shot-upload-error" role="alert">
          {error}
        </p>
      )}
      <div className="shot-location-actions">
        <button
          className="quiet-button"
          type="button"
          onClick={applyCoordinates}
        >
          {t("Применить координаты")}
        </button>
        {value && (
          <button
            className="icon-button"
            type="button"
            aria-label={t("Удалить локацию")}
            onClick={() => {
              onChange(null);
              setLatitude("");
              setLongitude("");
              setName("");
              setError("");
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {value && (
        <output className="shot-help shot-location-value" aria-live="polite">
          {shotLocationLabel(value)}
        </output>
      )}
    </div>
  );
}
