import { createEmptyDesign } from '@/core/model/types';
import { SANDBOX_SLOT } from '@/core/storage/persistence';
import {
  availableFeatures,
  availableParts,
  flatCourse,
  STANDARD_LEGS,
  type MedalThreshold,
  type Progress,
  type StageDef,
} from '@/game';

/**
 * サンドボックス(ステージに属さない自由設計)を、試走・評価の仕組みにそのまま流せるよう
 * StageDef の形にしたもの。平らな地面で、解放済みの部品・機能が使える。
 * メダル基準は [0,0,0](メダルなし)、ヒントは出さない、進行には記録しない(recordResult が無視する)。
 */

export const SANDBOX_STAGE_ID = SANDBOX_SLOT;
/** サンドボックスの目印(ゴール)までの距離(m)と制限時間(s) */
export const SANDBOX_GOAL = 5;
export const SANDBOX_TIME_LIMIT = 60;

const NO_MEDAL: MedalThreshold = [0, 0, 0];

let cache: { progress: Progress; stage: StageDef } | null = null;

/** 進行に応じたサンドボックス(同じ進行なら同じオブジェクトを返す) */
export function sandboxStage(progress: Progress): StageDef {
  if (cache?.progress === progress) return cache.stage;
  const empty = createEmptyDesign();
  const stage: StageDef = {
    id: SANDBOX_STAGE_ID,
    chapter: 0,
    order: 0,
    titleKey: 'flow.sandbox.title',
    descKey: 'flow.sandbox.desc',
    terrain: flatCourse(),
    start: { x: 0, z: 0 },
    goal: { x: SANDBOX_GOAL },
    timeLimit: SANDBOX_TIME_LIMIT,
    budget: null,
    parts: availableParts(progress),
    features: { legArray: availableFeatures(progress).includes('legArray') },
    defaultLegs: { ...STANDARD_LEGS },
    medals: { time: NO_MEDAL, parts: NO_MEDAL, cost: NO_MEDAL, energy: NO_MEDAL },
    hints: [
      { kind: 'text', key: 'flow.sandbox.hint' },
      { kind: 'ghost', key: 'flow.sandbox.hint', design: empty },
      { kind: 'ghost', key: 'flow.sandbox.hint', design: empty },
    ],
  };
  cache = { progress, stage };
  return stage;
}

export function isSandboxStage(stage: StageDef): boolean {
  return stage.id === SANDBOX_STAGE_ID;
}
