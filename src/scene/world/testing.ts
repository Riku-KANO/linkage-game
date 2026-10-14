import { recordResult, initialProgress } from '@/game/progress';
import { STAGES } from '@/game/stages';
import type { Medal, Progress, RunResult, StageId } from '@/game/types';

/**
 * 進行を作る小さな道具(テストと開発用パネルで共用)。本物の recordResult を通すので、
 * 解放の規則は game と同じになる。
 */
export function clearResult(
  stageId: StageId,
  medals: [Medal, Medal, Medal, Medal] = ['gold', 'silver', 'bronze', null],
): RunResult {
  return {
    stageId,
    cleared: true,
    reason: null,
    time: 3,
    parts: 10,
    cost: 1200,
    energy: 80,
    distance: 2,
    medals: { time: medals[0], parts: medals[1], cost: medals[2], energy: medals[3] },
  };
}

/** 最初の n ステージを(STAGES の順に)クリアした進行 */
export function progressWithCleared(
  n: number,
  medals?: [Medal, Medal, Medal, Medal],
  from: Progress = initialProgress(),
): Progress {
  let p = from;
  for (const s of STAGES.slice(0, n)) p = recordResult(p, clearResult(s.id, medals));
  return p;
}
