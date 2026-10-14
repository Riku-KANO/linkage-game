import type { DesignDoc } from '@/core/model/types';
import { runHeadless } from '@/core/sim/headless';
import type { HeadlessResult, TerrainCollider } from '@/core/sim/types';
import type { RunSummary, StageDef } from './types';

/**
 * ステージの試走をヘッドレスで回し、評価の入力(RunSummary)にする(TUNE-1)。
 * 地形(Rapier の TerrainCollider)は呼び出し側が createRapierTerrain(stage.terrain) で作って渡す
 * (Rapier の読み込みを game から切り離すため。同じ地形を何度でも使い回せる)。
 */

/**
 * 停動(クランクがトルク上限で止まったまま)がこの秒数続いたら試走を打ち切る(s)。
 * 段差に脚先が引っかかった機械は、待っていても動かない。重い機械が段差の途中で 2 秒ほど止まってから
 * 登り切ることがあるので、それより長くとる。
 */
export const RUN_STALL_TIMEOUT = 4;

export interface StageRunOptions {
  /** 打ち切る時刻(s)。既定は stage.timeLimit */
  maxTime?: number;
  /** 既定 RUN_STALL_TIMEOUT */
  stallTimeout?: number;
  /** スタート位置をずらす(m、頑健さの検査用)。ゴールも同じだけずらす */
  shiftX?: number;
}

export interface StageRun {
  summary: RunSummary;
  result: HeadlessResult;
}

/** ヘッドレス実行の結果を評価の入力に写す */
export function toRunSummary(result: HeadlessResult): RunSummary {
  return {
    time: result.goalTime ?? result.time,
    distance: result.distance,
    reachedGoal: result.reachedGoal,
    fallen: result.fallen,
    stalled: result.stalled,
    jammed: result.jammed,
    energy: result.energy,
    maxTilt: result.maxTilt,
  };
}

/** stage のスタートから design を歩かせる。決定論的(同じ入力・同じ地形なら同じ結果) */
export function runStage(
  stage: StageDef,
  design: DesignDoc,
  terrain: TerrainCollider,
  options: StageRunOptions = {},
): StageRun {
  const shift = options.shiftX ?? 0;
  const result = runHeadless(
    { design, terrain, start: { x: stage.start.x + shift, z: stage.start.z } },
    {
      maxTime: options.maxTime ?? stage.timeLimit,
      goalX: stage.goal.x + shift,
      stallTimeout: options.stallTimeout ?? RUN_STALL_TIMEOUT,
    },
  );
  return { summary: toRunSummary(result), result };
}
