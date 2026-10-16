export default function TypewriterIcon({ size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M7 9V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6M10 5h4" />
      <path d="M2 9h20M5 9 2 22h20L19 9" />
      <path d="M7 13h1m3 0h1m3 0h1M6 16h1m3 0h1m3 0h1M9 19h6" />
    </svg>
  );
}
