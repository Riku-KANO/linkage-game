import { analyzeMechanism, type MechanismAnalysis } from '@/core/kinematics/analyze';
import { legInstances } from '@/core/kinematics/legs';
import { computeBill } from '@/core/model/parts';
import type { DesignDoc } from '@/core/model/types';
import { CM } from '@/core/model/types';
import { DEFAULT_SIM_PARAMS } from '@/core/sim/types';
import { failReason } from './evaluate';
import { footStance } from './gait';
import type { FailCause, FailureDiagnosis, PreflightResult, RunSummary, StageDef } from './types';

/**
 * 失敗理由の判定(GAME-6)。結果画面に一言(トルク不足、重心が高い など)と、次に試すことを出す。
 * 優先順:設計の問題 > 予算オーバー > 機構が詰まった > 転倒(重心が高い / 転倒) > トルク不足
 *        > 逆向き > 時間切れ
 */

export const FAIL_CAUSES: readonly FailCause[] = [
  'invalid',
  'overBudget',
  'jammed',
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
    case 'stalled':
      return diagnosisFor(reason);
    case 'fallen': {
      const analysis = options.analysis ?? analyzeMechanism(design);
      const h = summary.comHeight ?? estimateComHeight(design, analysis);
      return diagnosisFor(h !== null && isTopHeavy(design, h, analysis) ? 'topHeavy' : 'fallen');
    }
    case 'timeout':
      return diagnosisFor(summary.distance < -WRONG_WAY_DISTANCE ? 'wrongWay' : 'timeout');
  }
}

/** 最初のクランクの軸(なければ原点)。脚列の反転もこの x を中心にする(mirrorDesignX と同じ) */
function pivotOf(design: DesignDoc): { x: number; y: number } {
  const id = design.cranks[0]?.pivot;
  const j = id ? design.joints.find((q) => q.id === id) : undefined;
  return { x: j?.x ?? 0, y: j?.y ?? 0 };
}
