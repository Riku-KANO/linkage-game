import { useEffect } from 'react';
import type { ScreenOverlay } from '@/scene/overlay/placeholders';
import type { Screen } from '@/ui/tokens';
import { ResultScreen } from '../ResultScreen';
import { TestRunScreen } from '../TestRunScreen';
import { installRunBridge } from './bridge';

/**
 * 試走画面・結果画面の統合(INT-2 / INT-3、stream int-run)の公開 API。
 *
 * App での組み立て(起動 bootApp() の後):
 *   useRunBridge();   // 画面とセッションと試走コースの表示をつなぐ
 *   <GameShell overlays={{ ...RUN_OVERLAYS }} scene3d={<RunWorld />} />
 *
 * 設計画面(INT-1)の試走ボタンは beginTestRun() を呼ぶ。試走前チェックで止まったときの問題の一覧は
 * 設計画面の試走ボタン(HUD の TestRunButton、INT-7a)が出す(runViewStore.preflightOpen が開く合図)。
 */
export const RUN_OVERLAYS: Partial<Record<Screen, ScreenOverlay>> = {
  testRun: TestRunScreen,
  result: ResultScreen,
};

/** 画面と試走をつなぐ(App で 1 回。アンマウントで外す)。セッションの起動は bootApp が行う */
export function useRunBridge(): void {
  useEffect(() => installRunBridge(), []);
}

export { TestRunScreen } from '../TestRunScreen';
export { ResultScreen } from '../ResultScreen';
export { RunWorld } from './RunWorld';
export {
  beginTestRun,
  startRunHere,
  restartRun,
  finishToResult,
  backToDesign,
  goNextStage,
  replayFall,
  ensureSlot,
  trimRunHistory,
} from './actions';
export { installRunBridge, RESULT_PANEL_PX } from './bridge';
export { runViewStore, getRunView, type RunView, type RunViewState } from './runView';
export { createLiveRunController, type LiveRunController } from './liveController';
export { trackPlacement, toWorld, TRACK_SURFACE_Y, type TrackPlacement } from './placement';
export { FOLLOW_DISTANCE } from './frame';
