import type { StoreApi, UseBoundStore } from 'zustand';
import type { DesignDoc } from '@/core/model/types';
import { getBrowserStorage } from '@/core/storage/browser';
import type { SaveFailReason, StorageLike } from '@/core/storage/persistence';
import type { Progress, StageId } from '@/game';
import { isSandboxStage, saveFailNotice, useSession, type SessionState } from './flow';

/**
 * ステージ選択のジオラマ(stream `world`、`src/scene/world/store.ts` の useWorld)への流し込み。
 * world はまだ main にない(並行ストリーム)ので、モジュールがあるときだけ働き、ないときは何もしない
 * (import.meta.glob は一致するファイルがなければ空になる。ビルドも型検査も通る)。
 *
 * 流すもの(WORLD-1 の契約「統合がここへ進行と機械を流し込む」):
 *  - 進行(setProgress)、ステージを始めた(enterStage)、試走の結果(noteRun:T-06 の歩行と章の機械)
 *  - ジオラマの目印をクリックしたら、セッションでステージを始めて設計画面へ(setStageSelectHandler)
 *  - DOM のステージ一覧のフォーカス ⇄ ジオラマの選択(selectStage / selectedStageId)
 *  - 機械(machineDesign・chapterMachines)の保存と復元:world の installWorldSave(`ashikumi/v1/world`)
 */

/** world の store のうち、ここで使うところ(world の WorldState の部分集合) */
interface WorldLike {
  selectedStageId: StageId | null;
  setProgress(progress: Progress): void;
  enterStage(id: StageId): void;
  noteRun(note: {
    stageId: StageId;
    cleared: boolean;
    progress: Progress;
    design: DesignDoc | null;
  }): void;
  selectStage(id: StageId | null): void;
  reset(): void;
}

interface WorldModule {
  useWorld: UseBoundStore<StoreApi<WorldLike>>;
  setStageSelectHandler?: (fn: ((id: StageId) => void) | null) => void;
  installWorldSave?: (
    storage: StorageLike | null,
    opts?: { onSaveFail?: (reason: SaveFailReason) => void },
  ) => () => void;
}

const modules = import.meta.glob<WorldModule>('/src/scene/world/store.ts', { eager: true });
const world: WorldModule | null =
  Object.values(modules).find((m) => typeof m.useWorld === 'function') ?? null;

/** ジオラマ(world)があるか */
export const worldAvailable = world !== null;

/**
 * セッション → ジオラマの流し込みを始める。戻り値で止める。world がなければ何もしない。
 * onSelectStage:ジオラマの目印で解放済みのステージを選んだとき(ステージを始めて設計画面へ)
 */
export function installWorldBridge(
  onSelectStage: (id: StageId) => void,
  storage: StorageLike | null = getBrowserStorage(),
): () => void {
  if (!world) return () => {};
  const w = () => world.useWorld.getState();
  // 保存してあった機械を先に戻す(作業台の見本機・棚の章の機械)
  const stopSave =
    world.installWorldSave?.(storage, {
      onSaveFail: (reason) => useSession.getState().pushNotice(saveFailNotice(reason)),
    }) ?? (() => {});
  const sync = (s: SessionState, prev: SessionState | null) => {
    if (!prev || s.progress !== prev.progress) w().setProgress(s.progress);
    if (s.stageId && s.stageId !== prev?.stageId) w().enterStage(s.stageId);
    const o = s.lastOutcome;
    if (o && o !== prev?.lastOutcome && !isSandboxStage(o.stage)) {
      w().noteRun({
        stageId: o.stage.id,
        cleared: o.result.cleared,
        progress: s.progress,
        design: o.design,
      });
    }
  };
  sync(useSession.getState(), null);
  const unsub = useSession.subscribe((s, prev) => sync(s, prev));
  world.setStageSelectHandler?.(onSelectStage);
  return () => {
    unsub();
    stopSave();
    world.setStageSelectHandler?.(null);
  };
}

/** DOM の一覧のフォーカスをジオラマの選択に伝える */
export function focusWorldStage(id: StageId): void {
  world?.useWorld.getState().selectStage(id);
}

/** 進行をリセットしたとき、ジオラマの機械・歩行も最初に戻す */
export function resetWorld(): void {
  if (!world) return;
  world.useWorld.getState().reset();
  world.useWorld.getState().setProgress(useSession.getState().progress);
}

const noSelection = () => null;
/** ジオラマで選んでいるステージ(world がなければ常に null)。ビルドごとに固定のフック */
export const useWorldSelectedStage: () => StageId | null = world
  ? () => world.useWorld((s) => s.selectedStageId)
  : noSelection;
