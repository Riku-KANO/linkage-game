import type { Medal } from '@/game/types';
import { t } from '@/i18n';
import type { MedalSet } from './stageSelect';

/** スコアの 4 軸(表示の順) */
export const MEDAL_AXES = ['time', 'parts', 'cost', 'energy'] as const;

export interface MedalPipsProps {
  /** 軸ごとのメダル。null はまだ記録がない(空の受け皿だけ) */
  medals: MedalSet | null;
  size?: 'sm' | 'md';
  className?: string;
}

const medalName = (m: Medal) => t(`game.medal.${m ?? 'none'}`);

/**
 * 最高メダルの小さな粒(到達時間・部品数・コスト・消費エネルギーの順)。
 * 金・銀・銅は金属の粒、メダルなしは空の受け皿。読み上げは軸ごと。
 */
export function MedalPips({ medals, size = 'sm', className }: MedalPipsProps) {
  const label = MEDAL_AXES.map((axis) =>
    t('hud.medal.aria', {
      axis: t(`game.axis.${axis}`),
      medal: medalName(medals ? medals[axis] : null),
    }),
  ).join('、');
  return (
    <span
      className={['hud-pips', `hud-pips--${size}`, className].filter(Boolean).join(' ')}
      role="img"
      aria-label={label}
    >
      {MEDAL_AXES.map((axis) => {
        const m = medals ? medals[axis] : null;
        return <i key={axis} className={`hud-pip hud-pip--${m ?? 'none'}`} data-axis={axis} />;
      })}
    </span>
  );
}
