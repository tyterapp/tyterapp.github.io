import {
  SCRIPT_VERSION_GEOMETRY,
  scriptVersionGeometry,
  scriptVersionSwatchStyle,
} from "./script-version-colors.js";
import "./script-version-icon.css";

// Shape is a second cue for revision colours, including in monochrome views.
export default function ScriptVersionIcon({
  versionId = "white",
  size = 16,
  className = "",
}) {
  const id = Object.hasOwn(SCRIPT_VERSION_GEOMETRY, versionId)
    ? versionId
    : "white";
  const {
    shape,
    path,
    symbol: _symbol,
    ...geometry
  } = scriptVersionGeometry(id);
  return (
    <svg
      className={`script-version-icon ${className}`.trim()}
      data-version-shape={id}
      style={scriptVersionSwatchStyle(id)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path ? (
        <path d={path} />
      ) : shape === "ellipse" ? (
        <ellipse {...geometry} />
      ) : (
        <circle {...geometry} />
      )}
    </svg>
  );
}
