import { useMemo } from 'react';
import { t } from '@/i18n';
import { useReducedMotion } from '@/ui/mech';
import { f1, MechDraw, useFigureClock } from './figures/draw';
import { boundsOf, cycleFigure, fitMap, poseAt } from './figures/motion';
import { RichText } from './Term';
import type { Tip } from './tips';
import './guide.css';

/**
 * 状況に応じた一言の吹き出し(GUIDE-4)。pickTip の結果をそのまま渡す(null なら何も出さない)。
 * 読み上げのために、吹き出しの外枠(aria-live)は tip がなくても置いておく。
 */

export interface TipBubbleProps {
  tip: Tip | null;
  /** × で閉じた(pickTip の events に { type: 'tipDismissed', tip: tip.id } を積むとよい) */
  onDismiss?: (tip: Tip) => void;
  /** 一言に添えるボタン(例:「回転を逆にする」)。ラベルと押したときの処理 */
  actionLabel?: string;
  onAction?: (tip: Tip) => void;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

export function TipBubble({
  tip,
  onDismiss,
  actionLabel,
  onAction,
  reducedMotion,
  className,
}: TipBubbleProps) {
  const reduced = useReducedMotion(reducedMotion);
  const text = tip ? t(tip.key, tip.params) : '';
  return (
    <div
      className={['gd-tip-region', reduced && 'gd-reduced', className].filter(Boolean).join(' ')}
      aria-live="polite"
    >
      {tip && (
        <div
          key={`${tip.id}:${text}`}
          className={`gd-tip gd-tip--${tip.severity}`}
          role="note"
          data-tip={tip.id}
        >
          <TipCrank reducedMotion={reduced} />
          <div className="gd-tip__main">
            <span className="gd-tip__label">{t(`guide.tip.severity.${tip.severity}`)}</span>
            <p className="gd-tip__text">
              <RichText text={text} reducedMotion={reduced} />
            </p>
            {actionLabel && onAction && (
              <button type="button" className="gd-tip__action" onClick={() => onAction(tip)}>
                {actionLabel}
              </button>
            )}
          </div>
          {onDismiss && (
            <button
              type="button"
              className="gd-x"
              aria-label={t('guide.tip.dismiss')}
              onClick={() => onDismiss(tip)}
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 吹き出しの左の、小さく回り続ける四節リンク(本物のソルバーの姿勢) */
function TipCrank({ reducedMotion }: { reducedMotion: boolean }) {
  const fig = useMemo(() => cycleFigure('loopFourBar'), []);
  const map = useMemo(() => fitMap(boundsOf(fig.cycle.positions), 44, 40, 5), [fig]);
  const time = useFigureClock(reducedMotion, 0.3);
  const pose = poseAt(fig.cycle, time / 2.8);
  return (
    <svg className="gd-tip__icon" viewBox="0 0 44 40" aria-hidden>
      <MechDraw
        mech={fig.mech}
        positions={pose.positions}
        map={map}
        ground={false}
        foot={false}
        weight={0.42}
      />
      <circle className="gd-axle" cx={f1(map.x(0))} cy={f1(map.y(0))} r={2} />
    </svg>
  );
}
