import type { ReactElement } from 'react';
import type { PartKind } from '@/core/model/types';

/** HUD のアイコン(線画、currentColor)。どれも装飾なので読み上げない */
const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export type HudIconName =
  | 'play'
  | 'back'
  | 'chevron'
  | 'close'
  | 'locate'
  | 'bulb'
  | 'lock'
  | 'check'
  | 'info'
  | 'warn'
  | 'error'
  | 'flag'
  | 'export'
  | 'import'
  | 'reset'
  | 'speaker'
  | 'mute'
  | 'next';

const ICONS: Record<HudIconName, ReactElement> = {
  play: <path d="M7 4.5v13l11-6.5z" fill="currentColor" />,
  back: <path {...S} d="M13.5 5L7.5 11l6 6" strokeWidth={2} />,
  next: <path {...S} d="M8.5 5l6 6-6 6" strokeWidth={2} />,
  chevron: <path {...S} d="M6 13.5l5-5 5 5" strokeWidth={2} />,
  close: <path {...S} d="M6.5 6.5l9 9M15.5 6.5l-9 9" strokeWidth={1.9} />,
  locate: (
    <g {...S}>
      <circle cx="11" cy="11" r="5" />
      <circle cx="11" cy="11" r="1.4" fill="currentColor" />
      <path d="M11 2.5v3M11 16.5v3M2.5 11h3M16.5 11h3" />
    </g>
  ),
  bulb: (
    <g {...S}>
      <path d="M7.6 13.2a5 5 0 1 1 6.8 0c-.8.7-1.2 1.4-1.2 2.3H8.8c0-.9-.4-1.6-1.2-2.3z" />
      <path d="M8.8 18h4.4M9.6 20h2.8" />
    </g>
  ),
  lock: (
    <g {...S}>
      <rect x="5" y="10" width="12" height="9" rx="1.6" />
      <path className="hud-lock__shackle" d="M7.8 10V7.4a3.2 3.2 0 0 1 6.4 0V10" />
      <circle cx="11" cy="14.3" r="1.1" fill="currentColor" stroke="none" />
    </g>
  ),
  check: <path {...S} d="M5 11.5l4 4 8-9" strokeWidth={2.2} />,
  info: (
    <g {...S}>
      <circle cx="11" cy="11" r="8" />
      <path d="M11 10v5.5" strokeWidth={2} />
      <circle cx="11" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </g>
  ),
  warn: (
    <g {...S}>
      <path d="M11 3.2l8.4 14.6H2.6z" />
      <path d="M11 8.6v4.6" strokeWidth={2} />
      <circle cx="11" cy="15.4" r="1.05" fill="currentColor" stroke="none" />
    </g>
  ),
  error: (
    <g {...S}>
      <path d="M7.7 3h6.6L19 7.7v6.6L14.3 19H7.7L3 14.3V7.7z" />
      <path d="M8.2 8.2l5.6 5.6M13.8 8.2l-5.6 5.6" strokeWidth={1.9} />
    </g>
  ),
  flag: (
    <g {...S}>
      <path d="M5 20V3" />
      <path d="M5 4h11l-2.5 3.5L16 11H5" fill="currentColor" fillOpacity={0.25} />
    </g>
  ),
  export: (
    <g {...S}>
      <path d="M11 13V3M7 6.5L11 3l4 3.5" />
      <path d="M4 12v6.5h14V12" />
    </g>
  ),
  import: (
    <g {...S}>
      <path d="M11 3v10M7 9.5l4 3.5 4-3.5" />
      <path d="M4 12v6.5h14V12" />
    </g>
  ),
  reset: (
    <g {...S}>
      <path d="M4.5 11a6.5 6.5 0 1 0 2-4.7" />
      <path d="M4 3.5v4h4" />
    </g>
  ),
  speaker: (
    <g {...S}>
      <path d="M4 8.5h3l4.5-4v13L7 13.5H4z" />
      <path d="M14.5 8a4 4 0 0 1 0 6M16.8 5.5a7.5 7.5 0 0 1 0 11" />
    </g>
  ),
  mute: (
    <g {...S}>
      <path d="M4 8.5h3l4.5-4v13L7 13.5H4z" />
      <path d="M14.5 8.5l5 5M19.5 8.5l-5 5" />
    </g>
  ),
};

export function HudIcon({ name, size = 16 }: { name: HudIconName; size?: number }) {
  return (
    <svg
      className={`hud-icon hud-icon--${name}`}
      width={size}
      height={size}
      viewBox="0 0 22 22"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

/** 部品のアイコン(チュートリアルで渡す部品・部品の解放) */
const PARTS: Record<PartKind, ReactElement> = {
  link: (
    <g {...S}>
      <path d="M5.5 16.5l11-11" strokeWidth={3.4} />
      <circle cx="5.5" cy="16.5" r="2.3" fill="currentColor" />
      <circle cx="16.5" cy="5.5" r="2.3" fill="currentColor" />
    </g>
  ),
  pin: (
    <g {...S}>
      <circle cx="11" cy="11" r="5.2" />
      <circle cx="11" cy="11" r="1.9" fill="currentColor" />
    </g>
  ),
  fixed: (
    <g {...S}>
      <circle cx="11" cy="7" r="2.3" />
      <path d="M11 9.3L6.3 15.5h9.4z" />
      <path d="M4.8 18.8l2-3M8.4 18.8l2-3M12 18.8l2-3M15.6 18.8l2-3" strokeWidth={1.2} />
    </g>
  ),
  crank: (
    <g {...S}>
      <circle cx="11" cy="11" r="1.9" />
      <path d="M11 11l5-4" strokeWidth={2.8} />
      <path d="M18 13.5a7.2 7.2 0 1 1-2.6-8" />
      <path d="M15.6 2.8l-.2 2.9 2.8.4" />
    </g>
  ),
  gear: (
    <g {...S}>
      <path d="M11 3.2l1.4 2.2 2.5-.7.6 2.5 2.5.6-.7 2.5 2.2 1.4-2.2 1.4.7 2.5-2.5.6-.6 2.5-2.5-.7L11 18.8l-1.4-2.2-2.5.7-.6-2.5-2.5-.6.7-2.5L2.5 11l2.2-1.4-.7-2.5 2.5-.6.6-2.5 2.5.7z" />
      <circle cx="11" cy="11" r="2.4" />
    </g>
  ),
  slider: (
    <g {...S}>
      <path d="M3 15h16" />
      <rect x="8" y="11.5" width="6" height="7" rx="1" />
      <path d="M11 11.5L6 5" strokeWidth={2.4} />
      <circle cx="6" cy="5" r="1.8" fill="currentColor" />
    </g>
  ),
  spring: (
    <g {...S}>
      <path d="M3 11h2.5l1.5-4 2 8 2-8 2 8 2-8 1.5 4H19" />
    </g>
  ),
};

export function PartIcon({ part, size = 20 }: { part: PartKind; size?: number }) {
  return (
    <svg
      className={`hud-part hud-part--${part}`}
      width={size}
      height={size}
      viewBox="0 0 22 22"
      aria-hidden="true"
      focusable="false"
    >
      {PARTS[part]}
    </svg>
  );
}
