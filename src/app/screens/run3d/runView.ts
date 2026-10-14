import { createStore } from 'zustand/vanilla';
import type { LiveRun } from '@/app/flow';
import type { Ghost } from '@/core/model/ghost';
import type { DesignDoc } from '@/core/model/types';
import { buildMachineLayout, machineRadius } from '@/testrun/layout';
import { createFollowRig, resetFollowRig } from './camera';
import { createLiveRunController, type LiveRunController } from './liveController';
import { trackPlacement, type TrackPlacement } from './placement';

/**
 * 工房の試走コースに出している試走(INT-2 / INT-3)。
 *
 * flow の RunPhase は結果を出すと LiveRun を手放すが、結果画面でも機械はコースの上(最後の姿勢)に
 * いてほしいので、ここで「いま見せている試走」を持ち続ける。新しい試走が始まるか、屋外の画面
 * (試走・結果)を離れてカメラが着いたら消す。3D(RunWorld)・操作盤(TestRunScreen)・
 * カメラの定位置はここを読む。演出(int-fx)もここから機体と進行役を受け取る。
 */

export interface RunView {
  /** 試走ごとの番号(React の key) */
  id: number;
  live: LiveRun;
  controller: LiveRunController;
  /** 転倒の瞬間の再生(記録しない) */
  replay: boolean;
  previousGhost: Ghost | null;
  /** 前回の試走の機械の設計(なければ今の設計で描く) */
  previousDesign: DesignDoc | null;
  opponentGhost: Ghost | null;
  /** 共有相手の機械の設計(flow がまだ持っていないので、なければ今の設計で描く) */
  opponentDesign: DesignDoc | null;
  placement: TrackPlacement;
  /** 機械の大きさ(m、追従カメラの距離の目安) */
  machineScale: number;
  /** 結果へ移した(二重に finishRun しない) */
  handedOver: boolean;
}

export interface RunViewState {
  view: RunView | null;
  /**
   * 試走前チェックで止まったことを設計画面に知らせる(試走ボタンを押したときだけ開く)。
   * 設計画面の試走ボタン(INT-7a)はこれが true の間だけ問題の一覧を開いて出す
   */
  preflightOpen: boolean;
}

export const runViewStore = createStore<RunViewState>(() => ({ view: null, preflightOpen: false }));

/** 試走の追従カメラ(1 つだけ。新しい試走で合わせ直す) */
export const followRig = createFollowRig();

let seq = 0;

export interface RunViewInput {
  live: LiveRun;
  replay: boolean;
  previousGhost: Ghost | null;
  previousDesign?: DesignDoc | null;
  opponentGhost: Ghost | null;
  opponentDesign?: DesignDoc | null;
  /** ↺・R:新しい試走を始める */
  onRestart?: () => void;
}

export function createRunView(input: RunViewInput): RunView {
  const { live } = input;
  return {
    id: ++seq,
    live,
    controller: createLiveRunController(live, {
      onRestart: input.onRestart,
      previousGhost: input.previousGhost,
      // 再生は「転倒の瞬間」を見せるものなので、自動スローは重ねない(もう ×0.5)
      autoSlowMo: !input.replay,
      // クランクトルクの計器は HUD の計器(モーター負荷)と重なるので、既定では隠す(表示の切り替えで出せる)
      show: { torque: false },
    }),
    replay: input.replay,
    previousGhost: input.previousGhost,
    previousDesign: input.previousDesign ?? null,
    opponentGhost: input.opponentGhost,
    opponentDesign: input.opponentDesign ?? null,
    placement: trackPlacement(live.stage),
    machineScale: Math.max(0.4, machineRadius(buildMachineLayout(live.design))),
    handedOver: false,
  };
}

export function getRunView(): RunView | null {
  return runViewStore.getState().view;
}

export function setRunView(view: RunView | null): void {
  const cur = runViewStore.getState().view;
  if (cur === view) return;
  if (view) resetFollowRig(followRig);
  runViewStore.setState({ view });
}

export function setPreflightOpen(open: boolean): void {
  if (runViewStore.getState().preflightOpen !== open)
    runViewStore.setState({ preflightOpen: open });
}
