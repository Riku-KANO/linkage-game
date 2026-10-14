import { analyzeMechanism, type MechanismAnalysis } from '@/core/kinematics/analyze';
import { legInstances } from '@/core/kinematics/legs';
import { computeBill } from '@/core/model/parts';
import type { DesignDoc } from '@/core/model/types';
import { CM } from '@/core/model/types';
import { DEFAULT_SIM_PARAMS } from '@/core/sim/types';
import { terrainHeightAt } from './courses';
import { failReason } from './evaluate';
import { footStance } from './gait';
import type { FailCause, FailureDiagnosis, PreflightResult, RunSummary, StageDef } from './types';

/**
 * 失敗理由の判定(GAME-6)。結果画面に一言(トルク不足、重心が高い など)と、次に試すことを出す。
 * 優先順:設計の問題 > 予算オーバー > 機構が詰まった > 転倒(重心が高い / 転倒)
 *        > 停動(段差につまずいた / トルク不足) > 逆向き > 時間切れ
 */

export const FAIL_CAUSES: readonly FailCause[] = [
  'invalid',
  'overBudget',
  'jammed',
  'stumbled',
  'stalled',
  'topHeavy',
  'fallen',
  'wrongWay',
  'timeout',
];

export function diagnosisFor(cause: FailCause): FailureDiagnosis {
  return { cause, key: `game.fail.${cause}`, adviceKey: `game.fail.${cause}.advice` };
}

/**
 * 転倒を「重心が高い」とみなす、静的に倒れ始める角度の上限(rad)。
 * 足元の余裕 / 重心の高さ の角度がこれより小さい機械は、倒れたら重心のせいとする。仮の値。
 */
export const TOP_HEAVY_ANGLE = (15 * Math.PI) / 180;

/** 後ろへこれ以上(m)進んだら「逆向きに歩いた」 */
const WRONG_WAY_DISTANCE = 0.05;

/**
 * 停動したとき、機体の足元(脚先が届く前後の範囲)にこれ以上(m)の上り段差があれば
 * 「段差につまずいた」とみなす。脚先の接触球(半径 2cm)より十分に高い段差だけを数える
 */
export const STUMBLE_STEP = 0.03;

export interface DiagnoseOptions {
  analysis?: MechanismAnalysis;
  /** 試走前チェックの結果。error があれば「設計に問題がある」 */
  preflight?: PreflightResult;
}

/**
 * 重心(クランク軸の真下と仮定)から支えの端までの余裕(m)。
 * x:接地区間の脚先が前後に広がる範囲(前後反転の脚を含む)。重心が範囲の外なら負。
 * z:脚列の幅の半分 + 接触球の半径。
 * 脚先がない・一回転できないときは null。
 */
export function supportMargin(
  design: DesignDoc,
  analysis: MechanismAnalysis = analyzeMechanism(design),
): { x: number; z: number } | null {
  const stance = footStance(analysis);
  if (!stance) return null;
  const px = pivotOf(design).x;
  let lo = stance.stanceMinX;
  let hi = stance.stanceMaxX;
  if (design.legs.mirrorX) {
    lo = Math.min(lo, 2 * px - stance.stanceMaxX);
    hi = Math.max(hi, 2 * px - stance.stanceMinX);
  }
  const x = Math.min(px - lo, hi - px) * CM;
  const z =
    Math.max(0, ...legInstances(design).map((i) => Math.abs(i.z))) + DEFAULT_SIM_PARAMS.footRadius;
  return { x, z };
}

/** 重心の高さの見積もり(m):クランク軸から脚先の最下点まで。求まらなければ null */
export function estimateComHeight(
  design: DesignDoc,
  analysis: MechanismAnalysis = analyzeMechanism(design),
): number | null {
  const stance = footStance(analysis);
  if (!stance) return null;
  return (pivotOf(design).y - stance.minY) * CM;
}

/** 重心の高さに比べて足元が狭い(倒れやすい)機械か */
export function isTopHeavy(
  design: DesignDoc,
  comHeight: number,
  analysis: MechanismAnalysis = analyzeMechanism(design),
): boolean {
  const m = supportMargin(design, analysis);
  if (!m || !(comHeight > 0)) return false;
  const margin = Math.min(m.x, m.z);
  return margin <= 0 || Math.atan2(margin, comHeight) < TOP_HEAVY_ANGLE;
}

export function diagnoseFailure(
  stage: StageDef,
  design: DesignDoc,
  summary: RunSummary,
  options: DiagnoseOptions = {},
): FailureDiagnosis | null {
  if (options.preflight && !options.preflight.ok) return diagnosisFor('invalid');
  const reason = failReason(stage, computeBill(design).cost, summary);
  switch (reason) {
    case null:
      return null;
    case 'invalid':
    case 'overBudget':
    case 'jammed':
      return diagnosisFor(reason);
    case 'stalled': {
      const analysis = options.analysis ?? analyzeMechanism(design);
      return diagnosisFor(stepUnderfoot(stage, design, summary, analysis) ? 'stumbled' : 'stalled');
    }
    case 'fallen': {
      const analysis = options.analysis ?? analyzeMechanism(design);
      const h = summary.comHeight ?? estimateComHeight(design, analysis);
      return diagnosisFor(h !== null && isTopHeavy(design, h, analysis) ? 'topHeavy' : 'fallen');
    }
    case 'timeout':
      return diagnosisFor(summary.distance < -WRONG_WAY_DISTANCE ? 'wrongWay' : 'timeout');
  }
}

/**
 * 止まった位置で、脚先が届く前後の範囲に上り段差(STUMBLE_STEP 以上)があるか。
 * 機体の位置はクランク軸がスタートから summary.distance だけ進んだ所とみなす(重心とほぼ同じ)。
 */
export function stepUnderfoot(
  stage: StageDef,
  design: DesignDoc,
  summary: RunSummary,
  analysis: MechanismAnalysis = analyzeMechanism(design),
): boolean {
  const reach = footReach(design, analysis);
  if (reach === null) return false;
  const x = stage.start.x + summary.distance;
  const z = stage.start.z;
  const dx = 0.01;
  let prev = terrainHeightAt(stage.terrain, x - reach, z);
  for (let px = x - reach + dx; px <= x + reach + 1e-9; px += dx) {
    const h = terrainHeightAt(stage.terrain, px, z);
    if (Number.isFinite(h) && Number.isFinite(prev) && h - prev >= STUMBLE_STEP) return true;
    prev = h;
  }
  return false;
}

/**
 * 脚先がクランク軸から前後に届く距離(m)+ 接触球の半径。前後反転した脚もあるので前後で同じとみなす。
 * 脚先がない・一回転できないときは null
 */
function footReach(design: DesignDoc, analysis: MechanismAnalysis): number | null {
  const f = analysis.compiled.footIndex;
  const { cycle } = analysis;
  if (f < 0 || !cycle.fullRotation) return null;
  const px = pivotOf(design).x;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of cycle.positions) {
    lo = Math.min(lo, p[f * 2]! - px);
    hi = Math.max(hi, p[f * 2]! - px);
  }
  return Math.max(hi, -lo, 0) * CM + DEFAULT_SIM_PARAMS.footRadius;
}

/** 最初のクランクの軸(なければ原点)。脚列の反転もこの x を中心にする(mirrorDesignX と同じ) */
function pivotOf(design: DesignDoc): { x: number; y: number } {
  const id = design.cranks[0]?.pivot;
  const j = id ? design.joints.find((q) => q.id === id) : undefined;
  return { x: j?.x ?? 0, y: j?.y ?? 0 };
}
