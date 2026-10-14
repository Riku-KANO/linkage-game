import { t } from '@/i18n';
import { LinkButton, useReducedMotion } from '@/ui/mech';
import { arcPath, dialAngle, f2 } from '@/ui/mech/math';
import { cx, Kbd } from './common';
import { formatMeters, formatSeconds, loadLevel, ratio, timeLevel } from './format';
import { HudIcon } from './icons';
import './hud.css';

/** 試走中に出す状態の札 */
export type RunBadge = 'stalled' | 'fallen' | 'jammed';
export const RUN_BADGES: readonly RunBadge[] = ['stalled', 'fallen', 'jammed'];

export interface RunHudProps {
  /** 経過時間(s) */
  elapsed: number;
  /** 制限時間(s) */
  timeLimit: number;
  /** 進んだ距離(m、後退なら負) */
  distance: number;
  /** スタートからゴールまで(m) */
  goalDistance: number;
  /** モーターの負荷(必要なトルク / 上限)。1 以上は停動 */
  motorLoad: number;
  /** 状態の札(停動・転倒・詰まった) */
  badges?: readonly RunBadge[];
  /** ゴースト(前回・相手)の距離(m)。あれば進み具合の帯に薄い印を出す */
  ghostDistance?: number | null;
  onBackToDesign: () => void;
  /** 「設計に戻る」に添えるキーの表示(例:Esc) */
  backShortcut?: string;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

// 負荷計の SVG(viewBox 0 0 W H)
const GW = 64;
const GH = 38;
const GX = 32;
const GY = 33;
const GR = 25;
const SWEEP = Math.PI;
/** 針が振れる上限(停動で少し行き過ぎて止まる) */
const LOAD_MAX = 1.05;
const ZONES = [
  ['low', 0, 0.6],
  ['mid', 0.6, 0.85],
  ['high', 0.85, 1],
  ['stall', 1, LOAD_MAX],
] as const;
const ZONE_PATHS = ZONES.map(([tone, a, b]) => ({
  tone,
  d: arcPath(GX, GY, GR, dialAngle(a, LOAD_MAX, SWEEP), dialAngle(b, LOAD_MAX, SWEEP)),
}));
const TICK_D = Array.from({ length: 6 }, (_, i) => {
  const a = dialAngle(i * 0.2, LOAD_MAX, SWEEP);
  const s = Math.sin(a);
  const c = -Math.cos(a);
  return `M${f2(GX + s * (GR - 7))} ${f2(GY + c * (GR - 7))}L${f2(GX + s * (GR - 3.5))} ${f2(GY + c * (GR - 3.5))}`;
}).join('');
const TRACK_TICKS = Array.from({ length: 9 }, (_, i) => (i + 1) * 10);

/**
 * 試走中の計器(HUD-5)。上の中央に時間・ゴールまでの進み具合・モーター負荷の計器を並べた
 * 真鍮の帯、その下に状態の札、左下に「設計に戻る」。毎フレーム props が変わる前提で、
 * 動かすのは transform と SVG の属性だけ(レイアウトは固定)。機械の周りは空けておく。
 */
export function RunHud({
  elapsed,
  timeLimit,
  distance,
  goalDistance,
  motorLoad,
  badges = [],
  ghostDistance,
  onBackToDesign,
  backShortcut,
  reducedMotion,
  className,
}: RunHudProps) {
  const rm = useReducedMotion(reducedMotion);
  const p = ratio(distance, goalDistance);
  const ghost =
    ghostDistance === null || ghostDistance === undefined
      ? null
      : ratio(ghostDistance, goalDistance);
  const load = Number.isFinite(motorLoad) ? Math.max(0, motorLoad) : 0;
  const level = loadLevel(load);
  const needle = (dialAngle(Math.min(load, LOAD_MAX), LOAD_MAX, SWEEP) * 180) / Math.PI;
  const loadPct = Math.round(load * 100);
  const tl = timeLevel(elapsed, timeLimit);
  const shown = new Set(badges);

  return (
    <div
      className={cx('hud-runhud', rm && 'hud-rm', className)}
      role="group"
      aria-label={t('hud.run.region')}
    >
      <div className="hud-plate hud-runhud__strip">
        <div
          className="hud-runhud__time"
          data-level={tl}
          role="timer"
          aria-label={t('hud.run.time')}
        >
          <span className="hud-runhud__label">{t('hud.run.time')}</span>
          <span className="hud-runhud__clock">
            <strong>{formatSeconds(elapsed)}</strong>
            <span className="hud-runhud__limit">/ {formatSeconds(timeLimit, 0)}</span>
          </span>
        </div>

        <div className="hud-runhud__course">
          <div className="hud-runhud__courseHead">
            <span className="hud-runhud__label">{t('hud.run.distance')}</span>
            <span className="hud-runhud__dist">
              {t('hud.run.distanceValue', {
                distance: formatMeters(distance),
                total: formatMeters(goalDistance),
              })}
            </span>
          </div>
          <div
            className="hud-track"
            role="progressbar"
            aria-label={t('hud.run.distance')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p * 100)}
            aria-valuetext={t('hud.run.progressAria', { percent: Math.round(p * 100) })}
          >
            <span
              className="hud-track__flag hud-track__flag--start"
              aria-hidden
              title={t('hud.run.start')}
            />
            <span className="hud-track__bed" aria-hidden>
              <span className="hud-track__fill" style={{ transform: `scaleX(${f2(p)})` }} />
              {TRACK_TICKS.map((x) => (
                <i key={x} className="hud-track__tick" style={{ left: `${x}%` }} />
              ))}
              {ghost !== null && (
                <span
                  className="hud-track__rail"
                  style={{ transform: `translateX(${f2(ghost * 100)}%)` }}
                >
                  <i className="hud-track__ghost" />
                </span>
              )}
              <span
                className="hud-track__rail"
                style={{ transform: `translateX(${f2(p * 100)}%)` }}
              >
                <i className="hud-track__marker" />
              </span>
            </span>
            <span
              className="hud-track__flag hud-track__flag--goal"
              aria-hidden
              title={t('hud.run.goal')}
            >
              <HudIcon name="flag" size={14} />
            </span>
          </div>
        </div>

        <div
          className="hud-runhud__load"
          data-level={level}
          role="meter"
          aria-label={t('hud.run.load')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(loadPct, 100)}
          aria-valuetext={t('hud.run.loadValue', { value: loadPct })}
        >
          <svg className="hud-gauge" viewBox={`0 0 ${GW} ${GH}`} aria-hidden>
            {ZONE_PATHS.map((z) => (
              <path key={z.tone} className={`hud-gauge__zone hud-gauge__zone--${z.tone}`} d={z.d} />
            ))}
            <path className="hud-gauge__ticks" d={TICK_D} />
            <g transform={`rotate(${f2(needle)} ${GX} ${GY})`}>
              <line className="hud-gauge__needle" x1={GX} y1={GY + 3} x2={GX} y2={GY - GR + 2} />
            </g>
            <circle className="hud-gauge__hub" cx={GX} cy={GY} r={3.2} />
          </svg>
          <span className="hud-runhud__loadText">
            <span className="hud-runhud__label">{t('hud.run.load')}</span>
            <strong>{t('hud.run.loadValue', { value: loadPct })}</strong>
          </span>
        </div>
      </div>

      <div className="hud-runhud__badges" role="status">
        {RUN_BADGES.filter((b) => shown.has(b)).map((b) => (
          <span key={b} className="hud-badge" data-badge={b}>
            {t(`hud.run.badge.${b}`)}
          </span>
        ))}
      </div>

      <div className="hud-runhud__back">
        <LinkButton
          variant="secondary"
          reducedMotion={rm}
          onClick={onBackToDesign}
          aria-keyshortcuts={backShortcut}
        >
          <HudIcon name="back" size={14} />
          {t('hud.run.back')}
          {backShortcut && <Kbd>{backShortcut}</Kbd>}
        </LinkButton>
      </div>
    </div>
  );
}
