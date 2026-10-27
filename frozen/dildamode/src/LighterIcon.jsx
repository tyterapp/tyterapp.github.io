export default function LighterIcon({ size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="5.5" y="11" width="13" height="10" rx="2" />
      <path d="M7.5 11V7.5h5V11M13 9h4.5v2M9.5 7.5V5M16 7c-2.5-1.2-2-3.5-.2-5 0 1.8 2.4 2.2.2 5Z" />
    </svg>
  );
}
