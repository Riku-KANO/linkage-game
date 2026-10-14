import { useMemo, useRef } from 'react';
import { playSfx } from '@/audio/sfx';
import type { MedalThreshold } from '@/game/types';
import {
  TAU,
  arcPath,
  clamp,
  dialAngle,
  dialPoint,
  digitCount,
  f2,
  gearPath,
  meshedAngle,
  meterValueAt,
  odometerDrums,
  stepCrossings,
  toDeg,
} from './math';
import { useClock } from './useClock';
import { useReducedMotion } from './useReducedMotion';
import './mech.css';

export interface GearMeterProps {
  /** 示す値 */
  value: number;
  /** 文字盤の最大値。超えた値の針はストッパーで止まる(数字ドラムは本当の値を示す) */
  max: number;
  /** 数字ドラムの小数の桁数 */
  decimals?: number;
  /** 数字ドラムの整数部の桁数(省略時は max と value から) */
  digits?: number;
  /** 数字ドラムの右に添える単位 */
  unit?: string;
  /** メダルの基準 [金, 銀, 銅](小さいほど良い)。文字盤に色の帯で示す */
  thresholds?: MedalThreshold;
  /** 比べる値(相手の記録など)。半透明の針で示す */
  ghostValue?: number;
  /** 回り始めるまで(s) */
  delay?: number;
  /** 回って止まるまで(s) */
  duration?: number;
  /** true で最終状態へ飛ぶ */
  skip?: boolean;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  /** 歯車の音(既定 true) */
  sound?: boolean;
  /** 止まったとき(スキップを含む) */
  onSettled?: () => void;
  /** 読み上げ用のラベル(省略時は値と単位) */
  ariaLabel?: string;
  className?: string;
}

// 文字盤の SVG の座標(viewBox 0 0 W H)
const W = 150;
const H = 86;
const CX = 75;
const CY = 63;
const FACE_R = 42;
const BAND_R = 34;
const NEEDLE_R = 37;
/** 目盛りの両端の数字(文字盤の内側、針の根元の左右) */
const SCALE_R = 25;
/** 針が振れる角度(200°。下の 160° は板に隠れる) */
const SWEEP = (200 * Math.PI) / 180;
/** 文字盤の裏の大歯車(針と一緒に回る)と、それを回す小歯車 */
const BIG_T = 36;
const BIG_R = 48;
const PIN_T = 12;
const PIN_R = (BIG_R * PIN_T) / BIG_T;
const DEPTH = 5;
const PIN_DIR = -0.72;
const PIN_X = CX + (BIG_R + PIN_R) * Math.cos(PIN_DIR);
const PIN_Y = CY + (BIG_R + PIN_R) * Math.sin(PIN_DIR);
const BIG_PATH = gearPath(BIG_T, BIG_R, DEPTH);
const PIN_PATH = gearPath(PIN_T, PIN_R, DEPTH);
/** 歯車の音の最短間隔(ms) */
const TICK_MS = 60;

type Tone = 'gold' | 'silver' | 'bronze' | 'none';

/**
 * 歯車式のメーター(RS-4、結果画面の 4 軸)。小歯車が回して大歯車と針が回り、
 * settle のイージングで少し行き過ぎてから値に止まる。下の数字ドラムも同じ歯車列で回る。
 * 歯が噛み合うたびに playSfx('gear')。動きの軽減・スキップでは即座に最終状態。
 */
export function GearMeter({
  value,
  max,
  decimals = 0,
  digits,
  unit,
  thresholds,
  ghostValue,
  delay = 0,
  duration = 1.1,
  skip = false,
  reducedMotion,
  sound = true,
  onSettled,
  ariaLabel,
  className,
}: GearMeterProps) {
  const instant = useReducedMotion(reducedMotion);
  const lastTick = useRef(-Infinity);
  const target = Number.isFinite(value) ? Math.max(0, value) : 0;
  const angleAt = (v: number) => dialAngle(v, max, SWEEP);

  const t = useClock({
    delay,
    duration,
    skip: skip || instant,
    onDone: onSettled,
    onFrame: (now, prev) => {
      if (!sound) return;
      // 小歯車の歯が 1 枚進むごとに鳴らす(間引く)
      const a0 = meshedAngle(angleAt(meterValueAt(prev, duration, target)), BIG_T, PIN_T, PIN_DIR);
      const a1 = meshedAngle(angleAt(meterValueAt(now, duration, target)), BIG_T, PIN_T, PIN_DIR);
      const ms = performance.now();
      if (stepCrossings(a0, a1, TAU / PIN_T) > 0 && ms - lastTick.current >= TICK_MS) {
        lastTick.current = ms;
        playSfx('gear', { volume: 0.45 });
      }
    },
  });
  const settled = skip || instant || !(duration > 0) || t >= duration;
  const shown = settled ? target : meterValueAt(t, duration, target);
  // 数字ドラムは表示の桁に丸めた値へ回す(最後の桁が半端な位置で止まらない)
  const scale = 10 ** decimals;
  const rounded = Math.round(target * scale) / scale;
  const drumValue = settled ? rounded : meterValueAt(t, duration, rounded);
  const angle = angleAt(shown);
  const pinion = meshedAngle(angle, BIG_T, PIN_T, PIN_DIR);

  const intDigits = digits ?? Math.max(digitCount(max), digitCount(rounded));
  const drums = odometerDrums(drumValue, intDigits, decimals);
  /** 最終値の上の桁の 0 は薄くする */
  const leading = intDigits - digitCount(rounded);

  const bands = useMemo(() => bandArcs(thresholds, max), [thresholds, max]);
  const ticks = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = -SWEEP / 2 + (SWEEP * i) / 10;
      const [x0, y0] = dialPoint(CX, CY, FACE_R - (i % 5 === 0 ? 7 : 4.5), a);
      const [x1, y1] = dialPoint(CX, CY, FACE_R - 2, a);
      out.push(`M${f2(x0)} ${f2(y0)}L${f2(x1)} ${f2(y1)}`);
    }
    return out.join('');
  }, []);

  const [nx, ny] = dialPoint(CX, CY, NEEDLE_R, angle);
  const ghost =
    ghostValue !== undefined && Number.isFinite(ghostValue)
      ? dialPoint(CX, CY, NEEDLE_R - 2, angleAt(ghostValue))
      : null;
  const [l0x, l0y] = dialPoint(CX, CY, SCALE_R, -SWEEP / 2);
  const [l1x, l1y] = dialPoint(CX, CY, SCALE_R, SWEEP / 2);

  return (
    <div
      className={['mech-meter', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={ariaLabel ?? `${target.toFixed(decimals)}${unit ?? ''}`}
      data-settled={settled || undefined}
    >
      <svg className="mech-meter__dial" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <g transform={`translate(${f2(CX)} ${f2(CY)}) rotate(${f2(toDeg(angle))})`}>
          <path className="mech-gear mech-gear--big" d={BIG_PATH} />
        </g>
        <g transform={`translate(${f2(PIN_X)} ${f2(PIN_Y)}) rotate(${f2(toDeg(pinion))})`}>
          <path className="mech-gear mech-gear--pinion" d={PIN_PATH} />
          <circle className="mech-gear__hub" r={4.2} />
          <circle className="mech-gear__hole" cx={PIN_R * 0.55} r={1.6} />
          <circle className="mech-gear__axle" r={1.6} />
        </g>
        <circle className="mech-meter__face" cx={CX} cy={CY} r={FACE_R} />
        {bands.map((b) => (
          <path key={b.tone} className={`mech-meter__band mech-tone--${b.tone}`} d={b.d} />
        ))}
        <path className="mech-meter__ticks" d={ticks} />
        <text className="mech-meter__scale" x={f2(l0x)} y={f2(l0y + 3)} textAnchor="middle">
          0
        </text>
        <text className="mech-meter__scale" x={f2(l1x)} y={f2(l1y + 3)} textAnchor="middle">
          {formatScale(max)}
        </text>
        {ghost && (
          <line className="mech-meter__ghost" x1={CX} y1={CY} x2={f2(ghost[0])} y2={f2(ghost[1])} />
        )}
        <line className="mech-meter__needle" x1={CX} y1={CY} x2={f2(nx)} y2={f2(ny)} />
        <circle className="mech-meter__hub" cx={CX} cy={CY} r={4.5} />
        <circle className="mech-gear__axle" cx={CX} cy={CY} r={1.6} />
        <rect className="mech-meter__plate" x={0} y={H - 9} width={W} height={9} />
        <line className="mech-meter__plate-edge" x1={0} y1={H - 8.5} x2={W} y2={H - 8.5} />
      </svg>
      <div className="mech-odo" aria-hidden>
        {drums.map((p, i) => (
          <span key={i} className="mech-odo__cell">
            {i === intDigits && decimals > 0 && <span className="mech-odo__dot">.</span>}
            <span className={`mech-odo__drum${i < leading ? ' mech-odo__drum--dim' : ''}`}>
              <span
                className="mech-odo__strip"
                style={{ transform: `translateY(${f2((-clamp(p, 0, 10) * 100) / 11)}%)` }}
              >
                {DIGITS}
              </span>
            </span>
          </span>
        ))}
        {unit ? <span className="mech-odo__unit">{unit}</span> : null}
      </div>
    </div>
  );
}

/** ドラムの帯:0〜9 と、9 の次に回ってくる 0 */
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d, i) => (
  <span key={i} className="mech-odo__digit">
    {d}
  </span>
));

function formatScale(max: number): string {
  return Number.isInteger(max) ? String(max) : String(Math.round(max * 100) / 100);
}

/** 金・銀・銅とメダルなしの範囲を文字盤の円弧にする(基準が逆順でも単調にそろえる) */
function bandArcs(thresholds: MedalThreshold | undefined, max: number) {
  if (!thresholds || !(max > 0)) return [];
  const [g, s, b] = thresholds;
  const gold = clamp(g, 0, max);
  const silver = clamp(Math.max(s, gold), 0, max);
  const bronze = clamp(Math.max(b, silver), 0, max);
  const edges: [Tone, number, number][] = [
    ['gold', 0, gold],
    ['silver', gold, silver],
    ['bronze', silver, bronze],
    ['none', bronze, max],
  ];
  return edges
    .filter(([, a, z]) => z > a)
    .map(([tone, a, z]) => ({
      tone,
      d: arcPath(CX, CY, BAND_R, dialAngle(a, max, SWEEP), dialAngle(z, max, SWEEP)),
    }));
}
