import { useId } from "react";
import { doctorCondition } from "./script-doctor.js";

const CASE =
  "M5 7.5h14a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 19v-9A2.5 2.5 0 0 1 5 7.5Z";
const CROSS = "M10.5 10.5h3V13h2.5v3h-2.5v2.5h-3V16H8v-3h2.5Z";

export default function ScriptDoctorIcon({ count }) {
  const mask = useId(),
    { errors, fill } = doctorCondition(count);
  return (
    <span
      className="script-doctor-icon"
      aria-hidden="true"
      data-error-count={errors}
      data-fill={fill}
      style={{ "--doctor-severity": fill }}
    >
      <svg
        className="doctor-case"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <defs>
          <mask
            id={mask}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="24"
            height="24"
          >
            <path d={CASE} fill="white" stroke="none" />
            <path d={CROSS} fill="black" stroke="none" />
          </mask>
        </defs>
        <g mask={`url(#${mask})`} stroke="none">
          <g
            className="doctor-liquid"
            style={{ transform: `translateY(${22 - fill * 15}px)` }}
          >
            <path
              className="doctor-water"
              d="M-12 1Q-6-1 0 1T12 1T24 1T36 1V26H-12Z"
            />
            {!!errors && (
              <path
                className="doctor-water-surface"
                d="M-12 1Q-6-1 0 1T12 1T24 1T36 1"
                fill="none"
                strokeWidth="1"
              />
            )}
          </g>
        </g>
        <path d={CASE} />
        <path d="M8.5 7.5V5A1.5 1.5 0 0 1 10 3.5h4A1.5 1.5 0 0 1 15.5 5v2.5" />
        <path d={CROSS} />
      </svg>
    </span>
  );
}
