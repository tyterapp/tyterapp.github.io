export default function RadioIcon({ size = 24, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7 7V2m-2 8H4v4h1m14-3h1v4h-1" />
      <rect x="5.5" y="7" width="13" height="15" rx="2.5" />
      <rect x="8.5" y="10" width="7" height="4" rx="1" />
      <path d="M9 17h6m-6 2.5h6m0-16v3" />
    </svg>
  );
}
