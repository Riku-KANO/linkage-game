import { isStageCleared, isStageUnlocked } from '@/game/progress';
import { getStage, nextStageId, STAGES } from '@/game/stages';
import type { Medal, Progress, StageId } from '@/game/types';

/**
 * ジオラマに出す進行の見え方(WORLD-1)。純粋な関数だけ。
 * - 目印の状態(未解放・遊べる・クリア)と、軸ごとの最高メダル
 * - 機械が立っている(歩いていく)ステージ
 */

export type MarkerState = 'locked' | 'playable' | 'cleared';

export function markerState(p: Progress, id: StageId): MarkerState {
  if (isStageCleared(p, id)) return 'cleared';
  return isStageUnlocked(p, id) ? 'playable' : 'locked';
}

/** メダルの軸(目印の小さな粒の並び順) */
export const MEDAL_AXES = ['time', 'parts', 'cost', 'energy'] as const;
export type MedalAxis = (typeof MEDAL_AXES)[number];

/** 軸ごとの最高メダル(MEDAL_AXES の順)。クリアしていなければすべて null */
export function markerMedals(p: Progress, id: StageId): Medal[] {
  const best = p.best[id];
  if (!best?.cleared) return MEDAL_AXES.map(() => null);
  return MEDAL_AXES.map((a) => best.medals[a]);
}

/** 進行の最前線:解放済みでまだクリアしていない最初のステージ。全部クリアなら最後のステージ */
export function frontierStage(p: Progress): StageId {
  const open = STAGES.find((s) => isStageUnlocked(p, s.id) && !isStageCleared(p, s.id));
  if (open) return open.id;
  const last = [...STAGES].reverse().find((s) => isStageUnlocked(p, s.id));
  return (last ?? STAGES[0]!).id;
}

export interface WalkPlan {
  from: StageId;
  to: StageId;
}

/**
 * クリアしたステージから次のステージへ歩く計画(T-06)。
 * 次のステージがない(最後のステージ)か、まだ解放されていなければ歩かない。
 */
export function planWalk(p: Progress, cleared: StageId | null): WalkPlan | null {
  if (!cleared || !getStage(cleared) || !isStageCleared(p, cleared)) return null;
  const to = nextStageId(cleared);
  if (!to || !isStageUnlocked(p, to)) return null;
  return { from: cleared, to };
}

/**
 * 機械が立っているステージ。T-06 の歩行が残っていれば行き先、
 * なければ今のステージ(解放済みなら)、それもなければ最前線。
 */
export function restingStage(
  p: Progress,
  currentStageId: StageId | null,
  lastClearedStageId: StageId | null,
): StageId {
  const walk = planWalk(p, lastClearedStageId);
  if (walk) return walk.to;
  if (currentStageId && getStage(currentStageId) && isStageUnlocked(p, currentStageId)) {
    return currentStageId;
  }
  return frontierStage(p);
}
