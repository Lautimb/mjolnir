export function MjolnirMark({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="100 92 312 330" height={size} aria-hidden="true">
      <defs>
        <linearGradient id="mark-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffdc85" />
          <stop offset="1" stopColor="#df9f2e" />
        </linearGradient>
      </defs>
      <g transform="translate(0 -14)">
        <rect x="229" y="238" width="54" height="166" rx="10" fill="#8a5630" />
        <path
          d="M229 270 L283 254 M229 304 L283 288 M229 338 L283 322 M229 372 L283 356"
          stroke="#3f2410"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <rect x="214" y="396" width="84" height="32" rx="11" fill="url(#mark-gold)" />
        <path d="M132 112 H380 L404 136 V222 L380 246 H132 L108 222 V136 Z" fill="url(#mark-gold)" />
        <path d="M278 126 L220 184 H254 L232 234 L298 168 H264 Z" fill="#15161b" />
      </g>
    </svg>
  )
}
