// Geometry from the supplied card.svg and outline.svg; use the interface stroke.
const CARD = [
  "M27 6H5C4.44772 6 4 6.44772 4 7V25C4 25.5523 4.44772 26 5 26H27C27.5523 26 28 25.5523 28 25V7C28 6.44772 27.5523 6 27 6Z",
  "M10 12H22",
  "M10 16H22",
  "M10 20H22",
];
const OUTLINE = [
  "M25 22V8C25 7.20435 24.6839 6.44129 24.1213 5.87868C23.5587 5.31607 22.7956 5 22 5H5",
  "M13 13H21",
  "M13 17H21",
  "M3 10C3 10 2 9.25 2 8C2 7.20435 2.31607 6.44129 2.87868 5.87868C3.44129 5.31607 4.20435 5 5 5C5.79565 5 6.55871 5.31607 7.12132 5.87868C7.68393 6.44129 8 7.20435 8 8V24C8 24.7956 8.31607 25.5587 8.87868 26.1213C9.44129 26.6839 10.2044 27 11 27M11 27C11.7956 27 12.5587 26.6839 13.1213 26.1213C13.6839 25.5587 14 24.7956 14 24C14 22.75 13 22 13 22H27C27 22 28 22.75 28 24C28 24.7956 27.6839 25.5587 27.1213 26.1213C26.5587 26.6839 25.7956 27 25 27H11Z",
];
function Icon({ paths, size = 18, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={8 / 3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
export const CardIcon = (props) => <Icon paths={CARD} {...props} />;
export const OutlineIcon = (props) => <Icon paths={OUTLINE} {...props} />;
export const cropIconSvg = (size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 1.5V12H14.5"/><path d="M1.5 4H4"/><path d="M6 4H12V10"/><path d="M12 12V14.5"/></svg>`;
export const cardIconSvg = (size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="${8 / 3}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CARD.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
