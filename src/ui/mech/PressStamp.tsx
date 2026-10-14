import { useRef } from 'react';
import { playSfx } from '@/audio/sfx';
import type { Medal } from '@/game/types';
import { PRESS_CRANK, PRESS_IMPACT, clamp01, f2, pressPose } from './math';
import { useClock } from './useClock';
import { useReducedMotion } from './useReducedMotion';
import './mech.css';

export interface PressStampProps {
  /** 刻印するメダル。null は「メダルなし」(打っても浅い印だけ) */
  medal: Medal;
  /** メダルの中に刻む文字(金・銀・銅など)。null のときは「—」 */
  glyph?: string;
  /** false なら打たずに空の台座のまま(失敗のときなど) */
  armed?: boolean;
  /** 打ち始めるまで(s) */
  delay?: number;
  /** クランクが一回転する長さ(s) */
  duration?: number;
  /** true で最終状態(刻印済み)へ飛ぶ */
  skip?: boolean;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  /** 刻印の音(既定 true) */
  sound?: boolean;
  /** 刻印した瞬間(動いているときだけ) */
  onStamp?: () => void;
  /** 終わったとき(スキップを含む) */
  onDone?: () => void;
  ariaLabel?: string;
  className?: string;
}

// SVG の座標(viewBox 0 0 W H)
const W = 74;
const H = 138;
const CX = 37;
/** クランク軸 */
const CRANK_Y = 18;
/** ラムの上端は手首ピンの 4 上、型(ダイ)の下端は手首ピンの 21 下 */
const RAM_TOP = -4;
const DIE_BOTTOM = 21;
/** メダル(上死点の型から 22 下、下死点で型がちょうど当たる) */
const MEDAL_Y = 105;
const MEDAL_R = 19;

/**
 * プレス機の刻印(RS-4、結果画面のメダル)。クランクが回って連接棒がラムを押し下げ
 * (スライダークランク)、下死点でメダルを打ち、台が揺れて playSfx('stamp')。
 * 動きの軽減・スキップでは刻印済みの最終状態をそのまま見せる。
 */
export function PressStamp({
  medal,
  glyph,
  armed = true,
  delay = 0,
  duration = 0.62,
  skip = false,
  reducedMotion,
  sound = true,
  onStamp,
  onDone,
  ariaLabel,
  className,
}: PressStampProps) {
  const instant = useReducedMotion(reducedMotion);
  const stampedOnce = useRef(false);
  const t = useClock({
    delay,
    duration: armed ? duration : 0,
    skip: skip || instant || !armed,
    onDone,
    onFrame: (now) => {
      if (stampedOnce.current || !pressPose(now, duration).stamped) return;
      stampedOnce.current = true;
      if (sound) playSfx('stamp', medal ? undefined : { volume: 0.5, rate: 0.8 });
      onStamp?.();
    },
  });
  const finished = !armed || skip || instant || !(duration > 0) || t >= duration;
  const pose = finished ? pressPose(duration, duration) : pressPose(t, duration);
  const stamped = armed && (finished || pose.stamped);

  // スライダークランクの関節
  const { r, l } = PRESS_CRANK;
  const pinX = CX + r * Math.sin(pose.crank);
  const pinY = CRANK_Y - r * Math.cos(pose.crank);
  const wristY = pinY + Math.sqrt(Math.max(0, l * l - (pinX - CX) ** 2));
  // 刻印の直後:台の揺れと、メダルの縁から広がる輪
  const since = finished ? 1 : clamp01((t / duration - PRESS_IMPACT) / 0.35);
  const shakeY = finished ? 0 : pose.shake * 1.6;
  const tone = medal ?? 'none';

  return (
    <div
      className={['mech-press', className].filter(Boolean).join(' ')}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      data-medal={tone}
      data-stamped={stamped || undefined}
    >
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden>
        {/* 枠:柱と梁、案内のレール */}
        <rect className="mech-press__post" x={5} y={6} width={5} height={H - 14} rx={1.5} />
        <rect className="mech-press__post" x={W - 10} y={6} width={5} height={H - 14} rx={1.5} />
        <rect className="mech-press__beam" x={2} y={4} width={W - 4} height={9} rx={2} />
        <rect className="mech-press__guide" x={20} y={36} width={2.5} height={56} />
        <rect className="mech-press__guide" x={W - 22.5} y={36} width={2.5} height={56} />

        {/* 台とメダル(刻印の衝撃で揺れる) */}
        <g transform={`translate(0 ${f2(shakeY)})`}>
          <rect
            className="mech-press__anvil"
            x={4}
            y={MEDAL_Y + MEDAL_R - 1}
            width={W - 8}
            height={8}
            rx={2}
          />
          {stamped && medal && since < 1 && (
            <circle
              className={`mech-press__ring mech-tone--${tone}`}
              cx={CX}
              cy={MEDAL_Y}
              r={f2(MEDAL_R + since * 12)}
              style={{ opacity: f2(1 - since) }}
            />
          )}
          <circle
            className={`mech-press__medal${stamped ? ` mech-tone--${tone}` : ' mech-press__medal--blank'}`}
            cx={CX}
            cy={MEDAL_Y}
            r={MEDAL_R}
          />
          {stamped && (
            <>
              <circle className="mech-press__medal-rim" cx={CX} cy={MEDAL_Y} r={MEDAL_R - 3.5} />
              <text
                className={`mech-press__glyph${medal ? '' : ' mech-press__glyph--none'}`}
                x={CX}
                y={MEDAL_Y}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {medal ? (glyph ?? '') : '—'}
              </text>
            </>
          )}
        </g>

        {/* ラムと型 */}
        <rect
          className="mech-press__ram"
          x={CX - 13}
          y={f2(wristY + RAM_TOP)}
          width={26}
          height={DIE_BOTTOM - 6 - RAM_TOP}
          rx={2}
        />
        <rect
          className="mech-press__die"
          x={CX - 10}
          y={f2(wristY + DIE_BOTTOM - 6)}
          width={20}
          height={6}
          rx={1}
        />
        {/* クランク(はずみ車)と連接棒 */}
        <circle className="mech-press__wheel" cx={CX} cy={CRANK_Y} r={r + 3.5} />
        <line className="mech-press__rod" x1={f2(pinX)} y1={f2(pinY)} x2={CX} y2={f2(wristY)} />
        <circle className="mech-press__pin" cx={f2(pinX)} cy={f2(pinY)} r={2.4} />
        <circle className="mech-press__pin" cx={CX} cy={f2(wristY)} r={2.4} />
        <circle className="mech-press__axle" cx={CX} cy={CRANK_Y} r={2.2} />
      </svg>
    </div>
  );
}
