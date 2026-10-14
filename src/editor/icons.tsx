import type { ReactElement } from 'react';

/** 道具のアイコン(線画、currentColor) */
const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export type IconName =
  | 'select'
  | 'link'
  | 'fixed'
  | 'crank'
  | 'foot'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'mirror'
  | 'trash'
  | 'fit'
  | 'play'
  | 'pause'
  | 'copy'
  | 'paste';

const paths: Record<IconName, ReactElement> = {
  select: <path {...S} d="M5 3l11 8-5 1.2L14 18l-2.2 1-3-5.8L5 16z" />,
  link: (
    <g {...S}>
      <path d="M6 16L16 6" strokeWidth={3.2} />
      <circle cx="6" cy="16" r="2.2" fill="currentColor" />
      <circle cx="16" cy="6" r="2.2" fill="currentColor" />
    </g>
  ),
  fixed: (
    <g {...S}>
      <circle cx="11" cy="7" r="2.2" />
      <path d="M11 9.2L6.5 15.5h9z" />
      <path d="M5 18.5l2-3M8.5 18.5l2-3M12 18.5l2-3M15.5 18.5l2-3" strokeWidth={1.2} />
    </g>
  ),
  crank: (
    <g {...S}>
      <circle cx="11" cy="11" r="1.8" />
      <path d="M11 11l5-4" strokeWidth={2.6} />
      <path d="M18 13.5a7.2 7.2 0 1 1-2.6-8" />
      <path d="M15.6 2.8l-.2 2.9 2.8.4" />
    </g>
  ),
  foot: (
    <g {...S}>
      <path d="M8 3l3 10" strokeWidth={2.6} />
      <path d="M5.5 17.5c2-3.5 7-4 10.5-1.5 1 .7.6 2-.6 2H6.5c-.8 0-1.3-.3-1-.5z" />
    </g>
  ),
  delete: (
    <g {...S}>
      <path d="M6 6l10 10M16 6L6 16" strokeWidth={2} />
    </g>
  ),
  undo: (
    <g {...S}>
      <path d="M8 5L4 9l4 4" />
      <path d="M4 9h9a5 5 0 0 1 0 10H9" />
    </g>
  ),
  redo: (
    <g {...S}>
      <path d="M14 5l4 4-4 4" />
      <path d="M18 9H9a5 5 0 0 0 0 10h4" />
    </g>
  ),
  mirror: (
    <g {...S}>
      <path d="M11 3v16" strokeDasharray="2 2" />
      <path d="M8 6v10L3 16z" />
      <path d="M14 6v10l5 0z" />
    </g>
  ),
  trash: (
    <g {...S}>
      <path d="M4 6h14M9 6V4h4v2M6 6l1 13h8l1-13" />
    </g>
  ),
  fit: (
    <g {...S}>
      <path d="M3 8V3h5M14 3h5v5M19 14v5h-5M8 19H3v-5" />
      <rect x="7.5" y="7.5" width="7" height="7" rx="1" />
    </g>
  ),
  play: <path d="M7 4.5v13l11-6.5z" fill="currentColor" />,
  pause: (
    <g fill="currentColor">
      <rect x="6" y="4.5" width="3.5" height="13" rx="1" />
      <rect x="12.5" y="4.5" width="3.5" height="13" rx="1" />
    </g>
  ),
  copy: (
    <g {...S}>
      <rect x="7" y="7" width="11" height="11" rx="1.5" />
      <path d="M4 14V5.5C4 4.7 4.7 4 5.5 4H14" />
    </g>
  ),
  paste: (
    <g {...S}>
      <rect x="5" y="5" width="12" height="14" rx="1.5" />
      <path d="M8.5 5V3.5h5V5" />
    </g>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
