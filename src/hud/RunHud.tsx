import { useLayoutEffect, useRef, useState, type Ref } from 'react';
import { t } from '@/i18n';
import { LinkButton, useReducedMotion } from '@/ui/mech';
import { arcPath, dialAngle, f2 } from '@/ui/mech/math';
import { cx, Kbd } from './common';
import {
  formatMeters,
  formatSeconds,
  loadLevel,
  ratio,
  timeLevel,
  type LoadLevel,
  type TimeLevel,
} from './format';
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
  /** (int-polish で追加)いちばん外の要素(LiveRunHud が中の計器を書き換えるのに使う) */
  ref?: Ref<HTMLDivElement>;
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

/** 計器に出す値(表示の文字列・帯・割合)。RunHud の描画と LiveRunHud の書き換えで共通 */
export interface RunHudView {
  /** 経過時間の表示 */
  time: string;
  timeLevel: TimeLevel;
  /** 距離 / ゴールまでの表示 */
  distance: string;
  /** ゴールまでの進み具合 0..1 */
  progress: number;
  /** 進み具合(%、読み上げ用) */
  progressPct: number;
  /** ゴーストの進み具合 0..1(なければ null) */
  ghost: number | null;
  loadLevel: LoadLevel;
  /** 負荷(%、停動で 100 を超える) */
  loadPct: number;
  /** 負荷計の針の角度(度) */
  needle: number;
}

/** 計器の値を決める(純粋な関数。毎フレーム呼ぶので軽く保つ) */
export function runHudView(
  v: Pick<RunHudProps, 'elapsed' | 'timeLimit' | 'distance' | 'goalDistance' | 'motorLoad'> & {
    ghostDistance?: number | null;
  },
): RunHudView {
  const progress = ratio(v.distance, v.goalDistance);
  const load = Number.isFinite(v.motorLoad) ? Math.max(0, v.motorLoad) : 0;
  return {
    time: formatSeconds(v.elapsed),
    timeLevel: timeLevel(v.elapsed, v.timeLimit),
    distance: t('hud.run.distanceValue', {
      distance: formatMeters(v.distance),
      total: formatMeters(v.goalDistance),
    }),
    progress,
    progressPct: Math.round(progress * 100),
    ghost:
      v.ghostDistance === null || v.ghostDistance === undefined
        ? null
        : ratio(v.ghostDistance, v.goalDistance),
    loadLevel: loadLevel(load),
    loadPct: Math.round(load * 100),
    needle: (dialAngle(Math.min(load, LOAD_MAX), LOAD_MAX, SWEEP) * 180) / Math.PI,
  };
}

/**
 * 試走中の計器(HUD-5)。上の中央に時間・ゴールまでの進み具合・モーター負荷の計器を並べた
 * 真鍮の帯、その下に状態の札、左下に「設計に戻る」。毎フレーム props が変わる前提で、
 * 動かすのは transform と SVG の属性だけ(レイアウトは固定)。機械の周りは空けておく。
 * React を毎フレーム描き直したくないときは LiveRunHud を使う(同じ見た目)。
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
  ref,
}: RunHudProps) {
  const rm = useReducedMotion(reducedMotion);
  const v = runHudView({ elapsed, timeLimit, distance, goalDistance, motorLoad, ghostDistance });
  const p = v.progress;
  const ghost = v.ghost;
  const level = v.loadLevel;
  const loadPct = v.loadPct;
  const tl = v.timeLevel;
  const shown = new Set(badges);

  return (
    <div
      ref={ref}
      className={cx('hud-runhud', rm && 'hud-rm', className)}
      role="group"
      aria-label={t('hud.run.region')}
    >
      <div className="hud-plate hud-runhud__strip">
        <div
          className="hud-runhud__time"
          data-live="time"
          data-level={tl}
          role="timer"
          aria-label={t('hud.run.time')}
        >
          <span className="hud-runhud__label">{t('hud.run.time')}</span>
          <span className="hud-runhud__clock">
            <strong data-live="clock">{v.time}</strong>
            <span className="hud-runhud__limit">/ {formatSeconds(timeLimit, 0)}</span>
          </span>
        </div>

        <div className="hud-runhud__course">
          <div className="hud-runhud__courseHead">
            <span className="hud-runhud__label">{t('hud.run.distance')}</span>
            <span className="hud-runhud__dist" data-live="distance">
              {v.distance}
            </span>
          </div>
          <div
            className="hud-track"
            data-live="track"
            role="progressbar"
            aria-label={t('hud.run.distance')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={v.progressPct}
            aria-valuetext={t('hud.run.progressAria', { percent: v.progressPct })}
          >
            <span
              className="hud-track__flag hud-track__flag--start"
              aria-hidden
              title={t('hud.run.start')}
            />
            <span className="hud-track__bed" aria-hidden>
              <span
                className="hud-track__fill"
                data-live="fill"
                style={{ transform: `scaleX(${f2(p)})` }}
              />
              {TRACK_TICKS.map((x) => (
                <i key={x} className="hud-track__tick" style={{ left: `${x}%` }} />
              ))}
              {ghost !== null && (
                <span
                  className="hud-track__rail"
                  data-live="ghost"
                  style={{ transform: `translateX(${f2(ghost * 100)}%)` }}
                >
                  <i className="hud-track__ghost" />
                </span>
              )}
              <span
                className="hud-track__rail"
                data-live="marker"
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
          data-live="load"
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
            <g data-live="needle" transform={`rotate(${f2(v.needle)} ${GX} ${GY})`}>
              <line className="hud-gauge__needle" x1={GX} y1={GY + 3} x2={GX} y2={GY - GR + 2} />
            </g>
            <circle className="hud-gauge__hub" cx={GX} cy={GY} r={3.2} />
          </svg>
          <span className="hud-runhud__loadText">
            <span className="hud-runhud__label">{t('hud.run.load')}</span>
            <strong data-live="loadValue">{t('hud.run.loadValue', { value: loadPct })}</strong>
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

/* ---------------- 毎フレームの更新を React の外で(int-polish で追加) ---------------- */

/** 毎フレーム変わる値 */
export interface RunHudFrame {
  elapsed: number;
  distance: number;
  motorLoad: number;
  badges?: readonly RunBadge[];
  ghostDistance?: number | null;
}

/** 試走の値の出どころ(試走の進行役の onFrame など) */
export interface RunHudSource {
  /** 今の値(毎フレーム呼ぶので軽く) */
  read(): RunHudFrame;
  /** 値が変わりうるたびに onFrame を呼ぶ。戻り値で外す */
  subscribe(onFrame: () => void): () => void;
}

export type LiveRunHudProps = Omit<RunHudProps, keyof RunHudFrame | 'ref'> & {
  source: RunHudSource;
};

/** 状態の札とゴーストの有無(まれにしか変わらない。変わったときだけ React で描き直す) */
interface RareParts {
  key: string;
  badges: readonly RunBadge[];
  ghost: boolean;
}

function rareParts(f: RunHudFrame): RareParts {
  const badges = RUN_BADGES.filter((b) => f.badges?.includes(b));
  const ghost = f.ghostDistance !== null && f.ghostDistance !== undefined;
  return { key: `${badges.join(',')}|${ghost ? 'g' : ''}`, badges, ghost };
}

/** 書き換える要素(RunHud の data-live) */
const LIVE_KEYS = [
  'time',
  'clock',
  'distance',
  'track',
  'fill',
  'marker',
  'ghost',
  'load',
  'needle',
  'loadValue',
] as const;
type LiveKey = (typeof LIVE_KEYS)[number];

/** 文字だけを書き換える(React が持つ文字のノードはそのまま使う) */
function setText(el: Element | undefined, text: string) {
  if (!el) return;
  const node = el.firstChild;
  if (node && node.nodeType === 3 && !node.nextSibling) {
    if (node.nodeValue !== text) node.nodeValue = text;
  } else if (el.textContent !== text) el.textContent = text;
}

/**
 * RunHud と同じ見た目で、毎フレームの値を source から受け取り、React を描き直さずに
 * 文字・transform・SVG の属性だけを書き換える(状態の札・ゴーストの有無が変わったときだけ描き直す)。
 * 試走の画面のように毎フレーム値が変わるところで使う。
 */
export function LiveRunHud({ source, timeLimit, goalDistance, ...rest }: LiveRunHudProps) {
  const root = useRef<HTMLDivElement>(null);
  // 最初の描画の値(以後この props は変えない:React が書き換えた値を上書きしないように)
  const [first] = useState(() => ({ ...source.read() }));
  const [rare, setRare] = useState(() => rareParts(first));

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const nodes = new Map<LiveKey, Element>();
    for (const k of LIVE_KEYS) {
      const n = el.querySelector(`[data-live="${k}"]`);
      if (n) nodes.set(k, n);
    }
    const shown = new Map<string, string>();
    /** 前に書いた値と違うときだけ書く */
    const put = (key: string, value: string, write: (n: Element) => void, node?: LiveKey) => {
      if (shown.get(key) === value) return;
      shown.set(key, value);
      const n = nodes.get(node ?? (key as LiveKey));
      if (n) write(n);
    };
    const attr = (node: LiveKey, name: string, value: string) =>
      put(`${node}@${name}`, value, (n) => n.setAttribute(name, value), node);
    const style = (node: LiveKey, value: string) =>
      put(`${node}@style`, value, (n) => ((n as HTMLElement).style.transform = value), node);

    const apply = () => {
      const f = source.read();
      const v = runHudView({ ...f, timeLimit, goalDistance });
      attr('time', 'data-level', v.timeLevel);
      put('clock', v.time, (n) => setText(n, v.time));
      put('distance', v.distance, (n) => setText(n, v.distance));
      attr('track', 'aria-valuenow', String(v.progressPct));
      attr('track', 'aria-valuetext', t('hud.run.progressAria', { percent: v.progressPct }));
      style('fill', `scaleX(${f2(v.progress)})`);
      style('marker', `translateX(${f2(v.progress * 100)}%)`);
      if (v.ghost !== null) style('ghost', `translateX(${f2(v.ghost * 100)}%)`);
      attr('load', 'data-level', v.loadLevel);
      attr('load', 'aria-valuenow', String(Math.min(v.loadPct, 100)));
      const loadText = t('hud.run.loadValue', { value: v.loadPct });
      attr('load', 'aria-valuetext', loadText);
      put('loadValue', loadText, (n) => setText(n, loadText));
      attr('needle', 'transform', `rotate(${f2(v.needle)} ${GX} ${GY})`);
      const r = rareParts(f);
      setRare((prev) => (prev.key === r.key ? prev : r));
    };
    apply();
    return source.subscribe(apply);
    // 札・ゴーストの有無が変わって描き直したら、要素を拾い直す
  }, [source, timeLimit, goalDistance, rare.key]);

  return (
    <RunHud
      ref={root}
      {...rest}
      timeLimit={timeLimit}
      goalDistance={goalDistance}
      elapsed={first.elapsed}
      distance={first.distance}
      motorLoad={first.motorLoad}
      badges={rare.badges}
      ghostDistance={rare.ghost ? (first.ghostDistance ?? 0) : null}
    />
  );
}
