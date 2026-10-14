import { computeBill } from '@/core/model/parts';
import type { TerrainCollider } from '@/core/sim/types';
import { runStage } from './run';
import type { MedalThreshold, StageDef } from './types';

/**
 * メダル基準・制限時間・予算の校正(TUNE-3)。
 *
 * 方法:各ステージの参考解(stage.reference)を本物の sim(Rapier 地形、ステージのスタート位置、
 * 打ち切り CALIBRATION.maxTime 秒)で歩かせ、ゴールまでの時間と消費エネルギーを測る。部品数とコストは
 * 参考解の部品表(computeBill)から。そこから下の倍率で基準を作り、きりのよい値に切り上げる(niceCeil)。
 *
 * - 到達時間:金 = 参考解 × 1.05、銀 × 1.35、銅 × 1.8(参考解なら金に届く)
 * - 制限時間:参考解 × 5 と 15 秒の大きい方を 5 秒単位に切り上げ(銅 × 1.5 以上。初心者の遅い機械も
 *   ゴールできるよう緩くとる。速さはメダルで評価する)
 * - 消費エネルギー:金 = 参考解 × 1.1、銀 × 1.5、銅 × 2.2
 * - 部品数:金 = 参考解、銀 × 1.2、銅 × 1.5(整数に切り上げ)
 * - コスト:金 = 参考解、銀 × 1.2、銅 × 1.5。予算のあるステージでは予算を上限にする
 * - 予算(予算のあるステージだけ):参考解のコスト × 1.25
 *
 * 結果はステージデータ(stages.ts)に数値として書き込む(実行時には計算しない)。sim の調整で
 * 参考解の時間やエネルギーが変わったら、`pnpm calibrate` で表を出して書き直す。calibrate.test.ts は
 * ステージデータがこの校正から CALIBRATION.tolerance 以上ずれたら失敗する。
 */
export const CALIBRATION = {
  time: [1.05, 1.35, 1.8],
  energy: [1.1, 1.5, 2.2],
  parts: [1, 1.2, 1.5],
  cost: [1, 1.2, 1.5],
  budget: 1.25,
  timeLimit: { perReference: 5, min: 15, step: 5 },
  /** 測るときの打ち切り時刻(s)。ステージの制限時間とは無関係に十分長くとる */
  maxTime: 60,
  /** 時間・エネルギー由来の値のずれの許容(相対)。部品数・コスト・予算は sim によらないので一致を求める */
  tolerance: 0.15,
} as const;

/** 参考解の実測 */
export interface ReferenceMeasurement {
  stageId: string;
  /** 打ち切りまでにゴールしたか */
  reachedGoal: boolean;
  fallen: boolean;
  stalled: boolean;
  jammed: boolean;
  /** ゴールまでの時間(s)。未到達なら打ち切った時刻 */
  time: number;
  /** ゴールまでの消費エネルギー(J) */
  energy: number;
  /** 最大の傾き(rad) */
  maxTilt: number;
  parts: number;
  cost: number;
}

/** 校正で決まるステージの数値 */
export interface CalibratedNumbers {
  timeLimit: number;
  budget: number | null;
  medals: StageDef['medals'];
}

/**
 * きりのよい刻み:先頭の桁が 1 なら 0.05、2〜4 なら 0.1、5〜9 なら 0.2(× 位取り)。
 * 例:1.88 → 0.05、2.4 → 0.1、59 → 2、1240 → 50
 */
export function niceStep(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  const lead = v / p;
  return p * (lead < 2 ? 0.05 : lead < 5 ? 0.1 : 0.2);
}

/** きりのよい値に切り上げる(1.88 → 1.9、2.42 → 2.5、59.4 → 60、1243.5 → 1250) */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 0;
  const s = niceStep(v);
  return tidy(Math.ceil(v / s - 1e-9) * s);
}

/** 浮動小数の端数を落とす(0.30000000000000004 → 0.3) */
const tidy = (v: number) => Math.round(v * 1e6) / 1e6;

const scaled = (ref: number, factors: readonly number[], round: (v: number) => number) =>
  factors.map((f) => round(ref * f)) as unknown as MedalThreshold;

/** 参考解の実測から、ステージの数値を作る */
export function deriveStageNumbers(stage: StageDef, m: ReferenceMeasurement): CalibratedNumbers {
  const C = CALIBRATION;
  const time = scaled(m.time, C.time, niceCeil);
  const energy = scaled(m.energy, C.energy, niceCeil);
  const parts = scaled(m.parts, C.parts, (v) => Math.ceil(v - 1e-9));
  const budget = stage.budget === null ? null : niceCeil(m.cost * C.budget);
  const cost = scaled(m.cost, C.cost, niceCeil).map((v) =>
    budget === null ? v : Math.min(v, budget),
  ) as unknown as MedalThreshold;
  const { perReference, min, step } = C.timeLimit;
  const limit = Math.max(m.time * perReference, time[2] * 1.5, min);
  return {
    timeLimit: Math.ceil(limit / step - 1e-9) * step,
    budget,
    medals: { time, parts, cost, energy },
  };
}

/** 参考解を sim で歩かせて測る(地形は stage.terrain から作ったものを渡す) */
export function measureReference(stage: StageDef, terrain: TerrainCollider): ReferenceMeasurement {
  const ref = stage.reference;
  if (!ref) throw new Error(`stage ${stage.id} has no reference`);
  const { summary, result } = runStage(stage, ref, terrain, { maxTime: CALIBRATION.maxTime });
  const bill = computeBill(ref);
  return {
    stageId: stage.id,
    reachedGoal: summary.reachedGoal,
    fallen: summary.fallen,
    stalled: summary.stalled,
    jammed: summary.jammed,
    time: summary.time,
    energy: summary.energy,
    maxTilt: result.maxTilt,
    parts: bill.parts,
    cost: bill.cost,
  };
}

export interface CalibrationDrift {
  /** 'timeLimit'、'budget'、'medals.time[0]' など */
  field: string;
  actual: number | null;
  expected: number | null;
}

/**
 * ステージデータと校正値のずれ(許容を超えたものだけ)。
 * 時間・エネルギー・制限時間は相対 CALIBRATION.tolerance まで、部品数・コスト・予算は完全一致。
 */
export function calibrationDrift(stage: StageDef, derived: CalibratedNumbers): CalibrationDrift[] {
  const out: CalibrationDrift[] = [];
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= CALIBRATION.tolerance * Math.max(Math.abs(a), Math.abs(b));
  const check = (field: string, actual: number | null, expected: number | null, loose: boolean) => {
    const ok =
      actual === null || expected === null
        ? actual === expected
        : loose
          ? close(actual, expected)
          : actual === expected;
    if (!ok) out.push({ field, actual, expected });
  };
  check('timeLimit', stage.timeLimit, derived.timeLimit, true);
  check('budget', stage.budget, derived.budget, false);
  for (const axis of ['time', 'parts', 'cost', 'energy'] as const) {
    const loose = axis === 'time' || axis === 'energy';
    stage.medals[axis].forEach((v, i) =>
      check(`medals.${axis}[${i}]`, v, derived.medals[axis][i]!, loose),
    );
  }
  return out;
}

/** `pnpm calibrate` が出す表(1 行 1 ステージ) */
export function formatCalibrationRow(
  stage: StageDef,
  m: ReferenceMeasurement,
  d: CalibratedNumbers,
): string {
  const legs = stage.reference?.legs;
  const layout = legs ? `${legs.count}x${legs.phaseStepDeg}°${legs.mirrorX ? '±' : ''}` : '-';
  const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
  const th = (t: MedalThreshold) => `[${t.join(', ')}]`;
  const status = m.reachedGoal
    ? 'goal'
    : m.fallen
      ? 'FALL'
      : m.jammed
        ? 'JAM'
        : m.stalled
          ? 'STALL'
          : 'TIMEOUT';
  return [
    stage.id.padEnd(6),
    layout.padEnd(9),
    status.padEnd(7),
    `t=${m.time.toFixed(2)}s`.padEnd(9),
    `E=${m.energy.toFixed(0)}J`.padEnd(7),
    `tilt=${deg(m.maxTilt)}°`.padEnd(11),
    `parts=${m.parts}`.padEnd(9),
    `cost=${m.cost}`.padEnd(12),
    `| time: ${th(d.medals.time)} energy: ${th(d.medals.energy)} parts: ${th(d.medals.parts)} cost: ${th(d.medals.cost)} timeLimit: ${d.timeLimit} budget: ${d.budget ?? '-'}`,
  ].join(' ');
}
