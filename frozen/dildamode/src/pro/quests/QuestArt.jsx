import { useId } from "react";

// Original vector illustrations for the collectible cards.
export default function QuestArt({ theme = "hope" }) {
  const id = useId();
  return (
    <svg viewBox="0 0 300 178" className="quest-art" aria-hidden="true">
      <defs>
        <linearGradient id={id} x2="0" y2="1">
          <stop stopColor="oklch(0.8 0.12 255)" />
          <stop offset="1" stopColor="oklch(0.92 0.07 80)" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop stopColor="oklch(1 0 0 / 0.75)" />
          <stop offset="1" stopColor="oklch(1 0 0 / 0)" />
        </radialGradient>
      </defs>
      <rect width="300" height="178" fill={`url(#${id})`} />
      <circle cx="232" cy="43" r="56" fill={`url(#${id}-glow)`} />
      <circle cx="232" cy="43" r="23" fill="oklch(0.98 0.05 85)" />
      <path
        d="M0 113 58 65 112 117 182 85 245 118 300 72V178H0Z"
        fill="oklch(0.68 0.075 245)"
      />
      <path
        d="M0 141Q68 101 151 137T300 126V178H0Z"
        fill="oklch(0.61 0.078 165)"
      />
      <path
        d="M0 162Q105 139 170 161T300 154V178H0Z"
        fill="oklch(0.5 0.064 165)"
      />
      {theme === "animal" ? (
        <g stroke="oklch(0.31 0.035 70)" strokeWidth="3" strokeLinejoin="round">
          <path
            d="M178 157Q219 150 206 128Q196 115 192 132"
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <ellipse
            cx="148"
            cy="143"
            rx="35"
            ry="29"
            fill="oklch(0.79 0.09 70)"
          />
          <path
            d="M111 67 106 35 133 51Q149 46 164 52L192 35 187 70Q200 99 174 113Q147 129 121 111Q98 96 111 67Z"
            fill="oklch(0.83 0.092 70)"
          />
          <path
            d="M112 41 116 63 129 53M186 41 180 63 167 54"
            fill="oklch(0.73 0.086 35)"
            stroke="none"
          />
          <ellipse
            cx="129"
            cy="81"
            rx="8"
            ry="10"
            fill="oklch(0.93 0.09 145)"
          />
          <ellipse
            cx="171"
            cy="81"
            rx="8"
            ry="10"
            fill="oklch(0.93 0.09 145)"
          />
          <path
            d="M130 75v11m40-11v11M144 97l6 5 6-5Z"
            fill="oklch(0.31 0.035 70)"
            strokeLinecap="round"
          />
          <path
            d="m116 96-22-3m22 11-23 5m91-13 22-3m-22 11 23 5m-66 28v30m-20-27v27"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      ) : theme === "journey" ? (
        <g>
          <path d="M111 178 140 112h21l42 66" fill="oklch(0.91 0.052 80)" />
          <path
            d="M144 128h9m-8 18h14m-20 20h31"
            stroke="oklch(0.99 0.005 80)"
            strokeWidth="4"
          />
          {[108, 185].map((x, i) => (
            <g key={x} transform={`translate(${x} 112)`}>
              <circle cy="-15" r="9" fill="oklch(0.88 0.067 65)" />
              <path
                d="M-8 0h16l4 31h-24Z"
                fill={i ? "oklch(0.64 0.095 40)" : "oklch(0.54 0.11 265)"}
              />
              <path
                d="m-4 31-3 18m11-18 3 18m-14-43-7 18m23-18 7 18"
                fill="none"
                stroke="oklch(0.33 0.032 260)"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <rect
                x="-11"
                y="3"
                width="9"
                height="22"
                rx="3"
                fill="oklch(0.88 0.075 80)"
              />
            </g>
          ))}
          <path
            d="M49 144V70m0 3h39l-8 13 8 13H49"
            fill="oklch(0.85 0.093 80)"
            stroke="oklch(0.4 0.04 70)"
            strokeWidth="3"
          />
        </g>
      ) : theme === "parting" ? (
        <g>
          <path
            d="M0 169h300m-300-8h300"
            stroke="oklch(0.33 0.045 265)"
            strokeWidth="4"
          />
          <rect
            x="17"
            y="78"
            width="186"
            height="73"
            rx="13"
            fill="oklch(0.44 0.054 265)"
          />
          {[31, 74, 117, 160].map((x) => (
            <rect
              key={x}
              x={x}
              y="89"
              width="30"
              height="24"
              rx="3"
              fill="oklch(0.92 0.072 80)"
            />
          ))}
          <circle cx="48" cy="153" r="10" fill="oklch(0.3 0.02 265)" />
          <circle cx="173" cy="153" r="10" fill="oklch(0.3 0.02 265)" />
          <circle cx="252" cy="101" r="10" fill="oklch(0.87 0.065 60)" />
          <path d="M240 119h24l5 37h-32Z" fill="oklch(0.66 0.099 20)" />
          <path
            d="m245 153-3 20m17-20 3 20m-21-48-14-17"
            stroke="oklch(0.3 0.03 265)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g>
          <path
            d="M83 103 150 52 217 103V167H83Z"
            fill="oklch(0.45 0.053 45)"
          />
          <path
            d="m72 109 78-60 78 60"
            fill="none"
            stroke="oklch(0.35 0.055 45)"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <rect
            x="134"
            y="108"
            width="33"
            height="59"
            rx="3"
            fill="oklch(0.92 0.111 85)"
          />
          <rect
            x="93"
            y="112"
            width="26"
            height="28"
            rx="3"
            fill="oklch(0.93 0.105 85)"
          />
          <rect
            x="182"
            y="112"
            width="26"
            height="28"
            rx="3"
            fill="oklch(0.93 0.105 85)"
          />
          <path
            d="M147 83c-10-12-28 3 3 21 31-18 13-33 3-21Z"
            fill="oklch(0.77 0.12 20)"
          />
          <path d="m135 167-25 11h89l-33-11" fill="oklch(0.96 0.09 85 / 0.5)" />
        </g>
      )}
      {[
        [25, 26],
        [72, 39],
        [116, 21],
        [184, 25],
        [272, 85],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x - 3} ${y}h6m-3-3v6`}
          stroke="oklch(1 0 0 / 0.8)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
