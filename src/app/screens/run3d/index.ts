import { useEffect } from 'react';
import type { ScreenOverlay } from '@/scene/overlay/placeholders';
import type { Screen } from '@/ui/tokens';
import { ResultScreen } from '../ResultScreen';
import { TestRunScreen } from '../TestRunScreen';
import { bootRunSession } from './bridge';

/**
 * 試走画面・結果画面の統合(INT-2 / INT-3、stream int-run)の公開 API。
 *
 * App での組み立て:
 *   useRunSession();   // 起動:session.init()・画面との橋・共有リンクの設計を開く
 *   <GameShell overlays={{ ...RUN_OVERLAYS }} scene3d={<RunWorld />}><RunLayer /></GameShell>
 *
 * 設計画面(INT-1)の試走ボタンは beginTestRun() を呼ぶ。
 */
export const RUN_OVERLAYS: Partial<Record<Screen, ScreenOverlay>> = {
  testRun: TestRunScreen,
  result: ResultScreen,
};

/** 起動時に 1 回:セッションを読み込み、画面と試走をつなぐ(アンマウントで外す) */
export function useRunSession(): void {
  useEffect(() => bootRunSession(), []);
}

export { TestRunScreen } from '../TestRunScreen';
export { ResultScreen } from '../ResultScreen';
export { RunWorld } from './RunWorld';
export { RunLayer } from './RunLayer';
export {
  beginTestRun,
  startRunHere,
  restartRun,
  finishToResult,
  backToDesign,
  goNextStage,
  replayFall,
  ensureSlot,
} from './actions';
export { bootRunSession, installRunBridge, RESULT_PANEL_PX } from './bridge';
export { runViewStore, run3dSignals, getRunView, type RunView, type RunViewState } from './runView';
export { createLiveRunController, type LiveRunController } from './liveController';
export { trackPlacement, toWorld, TRACK_SURFACE_Y, type TrackPlacement } from './placement';
export { END_PAUSE } from './frame';
