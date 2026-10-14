import { computeBill } from '@/core/model/parts';
import type { DesignDoc } from '@/core/model/types';
import type { FailReason, Medal, MedalThreshold, RunResult, RunSummary, StageDef } from './types';

/**
 * 試走の評価(GAME-2)。クリア条件とスコア 4 軸(到達時間・部品数・コスト・消費エネルギー)。
 * 設計の妥当性(自由度など)は試走前に preflight で確かめておくこと。ここでは予算だけを見る。
 */

/** 値が基準以下なら、そのメダル(小さいほど良い。境界は含む) */
export function medalFor(value: number, threshold: MedalThreshold): Medal {
  if (!Number.isFinite(value)) return null;
  const [gold, silver, bronze] = threshold;
  if (value <= gold) return 'gold';
  if (value <= silver) return 'silver';
  if (value <= bronze) return 'bronze';
  return null;
}

/** メダルの順位(金 3、銀 2、銅 1、なし 0) */
export function medalRank(m: Medal): number {
  return m === 'gold' ? 3 : m === 'silver' ? 2 : m === 'bronze' ? 1 : 0;
}

export function betterMedal(a: Medal, b: Medal): Medal {
  return medalRank(b) > medalRank(a) ? b : a;
}

/**
 * クリアできなかった理由。優先順:予算オーバー > 機構が詰まった > 転倒 > 停動 > 時間切れ。
 * クリアなら null。
 */
export function failReason(stage: StageDef, cost: number, summary: RunSummary): FailReason | null {
  if (stage.budget !== null && cost > stage.budget) return 'overBudget';
  if (summary.jammed) return 'jammed';
  if (summary.fallen) return 'fallen';
  if (summary.reachedGoal && summary.time <= stage.timeLimit) return null;
  if (summary.stalled) return 'stalled';
  return 'timeout';
}

export function evaluateRun(stage: StageDef, design: DesignDoc, summary: RunSummary): RunResult {
  const bill = computeBill(design);
  const reason = failReason(stage, bill.cost, summary);
  const cleared = reason === null;
  const time = summary.reachedGoal ? summary.time : stage.timeLimit;
  const medal = (value: number, th: MedalThreshold): Medal =>
    cleared ? medalFor(value, th) : null;
  return {
    stageId: stage.id,
    cleared,
    reason,
    time,
    parts: bill.parts,
    cost: bill.cost,
    energy: summary.energy,
    distance: summary.distance,
    medals: {
      time: medal(time, stage.medals.time),
      parts: medal(bill.parts, stage.medals.parts),
      cost: medal(bill.cost, stage.medals.cost),
      energy: medal(summary.energy, stage.medals.energy),
    },
  };
}
