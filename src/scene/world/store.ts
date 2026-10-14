import { create } from 'zustand';
import { useApp } from '@/app/store';
import { playSfx } from '@/audio/sfx';
import type { DesignDoc } from '@/core/model/types';
import { initialProgress, isChapterCleared } from '@/game/progress';
import { getStage } from '@/game/stages';
import type { Progress, StageId } from '@/game/types';
import type { SaveFailReason, StorageLike } from '@/core/storage/persistence';
import { loadWorldSave, saveWorldSave } from './save';
import { markerState, type WalkPlan } from './stageView';

/**
 * 工房が「育つ」ための状態(WORLD-1・WORLD-2)。統合(flow)がここへ進行と機械を流し込み、
 * 3D(ジオラマ・棚・作業台の見本機・図鑑の額)はここだけを見る。
 * 保存(U-01)は flow の担当:chapterMachines と machineDesign は flow が保存・復元して setWorld で戻す。
 */
export interface WorldData {
  /** クリア状況(game の Progress そのもの) */
  progress: Progress;
  /** 今のステージ(最後に遊んだ・選んだ)。ジオラマの機械はここに立つ */
  currentStageId: StageId | null;
  /** 直前にクリアしたステージ。T-06 で機械がここから次のステージへ歩き、歩き終えると null に戻る */
  lastClearedStageId: StageId | null;
  /** プレイヤーの最新の機械(作業台の見本機・ジオラマの小さな機械)。null ならヤンセン型の見本機 */
  machineDesign: DesignDoc | null;
  /** 章をクリアした機械(棚に並ぶ模型)。章番号 → 設計 */
  chapterMachines: Partial<Record<number, DesignDoc>>;
  /** ジオラマと DOM の一覧で共有するホバー中・選択中のステージ */
  hoveredStageId: StageId | null;
  selectedStageId: StageId | null;
}

export interface RunNote {
  stageId: StageId;
  /** この試走でクリアしたか */
  cleared: boolean;
  /** 結果を記録した後の進行(recordResult の戻り値) */
  progress: Progress;
  /** 試走した機械 */
  design: DesignDoc | null;
}

export interface WorldState extends WorldData {
  /** 進行中の T-06 の歩行(ジオラマが書く。読み取り専用として扱う) */
  walking: WalkPlan | null;
  /** まとめて差し替える(保存からの復元など) */
  setWorld(patch: Partial<WorldData>): void;
  setProgress(progress: Progress): void;
  setMachineDesign(design: DesignDoc | null): void;
  setChapterMachine(chapter: number, design: DesignDoc | null): void;
  /** ステージを始めた:今のステージを変え、残っている T-06 の歩行は捨てる */
  enterStage(id: StageId): void;
  /** 試走の結果を知らせる(進行・最新の機械・T-06 の歩行・章の機械をまとめて更新) */
  noteRun(note: RunNote): void;
  hoverStage(id: StageId | null): void;
  selectStage(id: StageId | null): void;
  /** ジオラマが T-06 の歩行を始めた・終えた */
  beginWalk(plan: WalkPlan): void;
  finishWalk(): void;
  reset(): void;
}

export function initialWorldData(): WorldData {
  return {
    progress: initialProgress(),
    currentStageId: null,
    lastClearedStageId: null,
    machineDesign: null,
    chapterMachines: {},
    hoveredStageId: null,
    selectedStageId: null,
  };
}

/** 試走の結果から変わるところ(純粋な関数) */
export function applyRun(state: WorldData, note: RunNote): Partial<WorldData> {
  const patch: Partial<WorldData> = {
    progress: note.progress,
    machineDesign: note.design ?? state.machineDesign,
    currentStageId: note.stageId,
  };
  if (!note.cleared) return patch;
  patch.lastClearedStageId = note.stageId;
  const chapter = getStage(note.stageId)?.chapter;
  if (
    chapter !== undefined &&
    note.design &&
    !state.chapterMachines[chapter] &&
    isChapterCleared(note.progress, chapter)
  ) {
    patch.chapterMachines = { ...state.chapterMachines, [chapter]: note.design };
  }
  return patch;
}

export const useWorld = create<WorldState>((set, get) => ({
  ...initialWorldData(),
  walking: null,
  setWorld(patch) {
    set(patch);
  },
  setProgress(progress) {
    if (get().progress !== progress) set({ progress });
  },
  setMachineDesign(design) {
    if (get().machineDesign !== design) set({ machineDesign: design });
  },
  setChapterMachine(chapter, design) {
    const next = { ...get().chapterMachines };
    if (design) next[chapter] = design;
    else delete next[chapter];
    set({ chapterMachines: next });
  },
  enterStage(id) {
    set({ currentStageId: id, lastClearedStageId: null, selectedStageId: id });
  },
  noteRun(note) {
    set(applyRun(get(), note));
  },
  hoverStage(id) {
    if (get().hoveredStageId !== id) set({ hoveredStageId: id });
  },
  selectStage(id) {
    if (get().selectedStageId !== id) set({ selectedStageId: id });
  },
  beginWalk(plan) {
    set({ walking: plan });
  },
  finishWalk() {
    const w = get().walking;
    if (!w) return;
    set({ walking: null, currentStageId: w.to, lastClearedStageId: null, selectedStageId: w.to });
  },
  reset() {
    set({ ...initialWorldData(), walking: null });
  },
}));

type StageSelectHandler = (id: StageId) => void;
let selectHandler: StageSelectHandler | null = null;

/**
 * ジオラマの目印をクリックしたときの処理を差し替える(統合が設定する)。null で既定に戻す。
 * 既定:今のステージにして、設計画面へ(T-02)。
 */
export function setStageSelectHandler(fn: StageSelectHandler | null): void {
  selectHandler = fn;
}

/**
 * 目印を選ぶ(クリック・Enter)。未解放なら音で知らせて false。
 * 解放済みなら selectedStageId を変え、差し替えた処理(なければ既定の処理)を呼ぶ。
 */
export function activateStage(id: StageId): boolean {
  const w = useWorld.getState();
  if (!getStage(id) || markerState(w.progress, id) === 'locked') {
    playSfx('error');
    return false;
  }
  w.selectStage(id);
  if (selectHandler) {
    selectHandler(id);
    return true;
  }
  playSfx('press');
  w.enterStage(id);
  useApp.getState().go('design', { stageId: id });
  return true;
}

/**
 * 機械(作業台の見本機・棚の章の機械)の保存を始める(統合が起動時に 1 回呼ぶ。戻り値で止める)。
 * 保存してあった機械を戻し(今の値が優先)、変わるたびに少し待ってまとめて保存する。
 */
export function installWorldSave(
  storage: StorageLike | null,
  opts: { delayMs?: number; onSaveFail?: (reason: SaveFailReason) => void } = {},
): () => void {
  const saved = loadWorldSave(storage);
  const w = useWorld.getState();
  w.setWorld({
    machineDesign: w.machineDesign ?? saved.machineDesign,
    chapterMachines: { ...saved.chapterMachines, ...w.chapterMachines },
  });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const s = useWorld.getState();
    const r = saveWorldSave(storage, {
      machineDesign: s.machineDesign,
      chapterMachines: s.chapterMachines,
    });
    if (!r.ok && storage) opts.onSaveFail?.(r.reason);
  };
  const unsub = useWorld.subscribe((s, prev) => {
    if (s.machineDesign === prev.machineDesign && s.chapterMachines === prev.chapterMachines)
      return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, opts.delayMs ?? 400);
  });
  return () => {
    unsub();
    if (timer) {
      clearTimeout(timer);
      flush();
    }
  };
}
