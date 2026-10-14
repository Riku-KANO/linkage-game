import { SANDBOX_SLOT, type DesignSlot } from '@/core/storage/persistence';
import { getStage, isStageCleared, isStageUnlocked, STAGES } from '@/game';
import type { Progress, StageId } from '@/game/types';

/**
 * ホームの「続きから」(作業台、T-07)で開く設計。
 *  - 最後に開いたスロット(ステージかサンドボックス)。ステージは今も解放されているときだけ
 *  - なければ(初回・リセットで未解放になった)最初の「解放済みで未クリア」のステージ
 *  - それもなければ(全部クリアして、最後のスロットの記録もない)null =「続きから」は選べない
 */
export type ContinueTarget = { kind: 'stage'; stageId: StageId } | { kind: 'sandbox' };

export function continueTarget(
  progress: Progress,
  lastSlot: DesignSlot | null | undefined,
): ContinueTarget | null {
  if (lastSlot === SANDBOX_SLOT) return { kind: 'sandbox' };
  if (lastSlot && getStage(lastSlot) && isStageUnlocked(progress, lastSlot)) {
    return { kind: 'stage', stageId: lastSlot };
  }
  const next = STAGES.find(
    (s) => isStageUnlocked(progress, s.id) && !isStageCleared(progress, s.id),
  );
  return next ? { kind: 'stage', stageId: next.id } : null;
}

/** 続きの先のスロット(ステージ id かサンドボックス) */
export function targetSlot(target: ContinueTarget): DesignSlot {
  return target.kind === 'sandbox' ? SANDBOX_SLOT : target.stageId;
}
