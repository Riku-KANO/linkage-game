import { useSession, type RunPhase } from '@/app/flow';
import { useApp } from '@/app/store';
import { setStationOverride, type StationOverride } from '@/scene/rig/stations';
import { useSceneUi } from '@/scene/store';
import type { Screen } from '@/ui/tokens';
import { backToDesign, restartRun, startRunHere, type SessionStore } from './actions';
import { dockPoseLeft, followPose } from './camera';
import {
  createRunView,
  followRig,
  getRunView,
  runViewStore,
  setPreflightOpen,
  setRunView,
} from './runView';

/**
 * 画面(useApp)・セッション(flow)・試走コースの表示(runView)をつなぐ(INT-2 / INT-3)。
 * App の起動時(bootApp の後)に 1 回 installRunBridge() を呼ぶ(戻り値で外す)。
 * セッションの起動・共有リンクの設計を開く・ステージ選択からステージを開く・ステージを閉じる
 * (ホーム・ステージ選択へ出たら leaveStage)は app の boot / actions が受け持つ。
 *
 *  - 試走が始まったら(run: running の新しい LiveRun)コースに出す。結果画面でもそのまま残す
 *  - 屋外の画面(試走・結果)を離れてカメラが着いたら片付ける(工房の見本機が戻る)
 *  - 試走画面に直接来たら試走を始める(チェックに通らなければ設計画面へ戻す)
 *  - 試走画面・結果画面を離れたら、走行中の試走はやめる・結果は閉じる
 *  - 試走・結果の画面での Esc・右クリックは「設計に戻る」(履歴をたどって試走へ戻らない)
 *  - カメラ:試走は追従カメラ、結果は右の結果パネルを避けて機械を左寄りに
 */

const OUTDOOR: ReadonlySet<Screen> = new Set<Screen>(['testRun', 'result']);

/** 結果パネルの幅と余白(CSS px、run3d.css の .ak-run-result と合わせる) */
export const RESULT_PANEL_PX = 560 + 32;

const followOverride: StationOverride = (base) => {
  const view = getRunView();
  if (!view || !view.controller.store.getState().follow) return null;
  return followPose(followRig, base);
};

const resultOverride: StationOverride = (base, ctx) => {
  if (!getRunView()) return null;
  return dockPoseLeft(base, ctx, RESULT_PANEL_PX);
};

export function installRunBridge(store: SessionStore = useSession): () => void {
  const unsubs: (() => void)[] = [];

  const syncRun = (run: RunPhase) => {
    if (run.phase === 'running') {
      const cur = getRunView();
      if (cur?.live === run.live) return;
      const s = store.getState();
      const slot = s.slot;
      const last = slot !== null ? s.lastRuns[slot] : undefined;
      setRunView(
        createRunView({
          live: run.live,
          replay: run.replay,
          previousGhost: run.previousGhost,
          previousDesign: run.previousGhost && last ? last.design : null,
          opponentGhost: run.opponentGhost,
          onRestart: () => void restartRun(store),
        }),
      );
    } else if (run.phase === 'idle' && !OUTDOOR.has(useApp.getState().screen)) {
      setRunView(null);
    }
  };
  syncRun(store.getState().run);
  unsubs.push(
    store.subscribe((s, prev) => {
      if (s.run !== prev.run) syncRun(s.run);
      // 試走前チェックが通るようになったら知らせを閉じる
      if (s.preflight !== prev.preflight && s.preflight?.ok) setPreflightOpen(false);
    }),
  );

  unsubs.push(
    useApp.subscribe((s, prev) => {
      if (s.screen !== prev.screen) {
        if (s.screen !== 'design') setPreflightOpen(false);
        const phase = store.getState().run.phase;
        if (s.screen === 'testRun') {
          // 試走ボタン(beginTestRun)を通らずに来た:ここで始める
          if (phase === 'idle' || phase === 'finished') void startRunHere(store);
        } else if (prev.screen === 'testRun' && s.screen !== 'result') {
          if (phase === 'running' || phase === 'loading') store.getState().abortRun();
        } else if (prev.screen === 'result' && phase === 'finished') {
          store.getState().dismissResult();
        }
      }
      // 屋外を離れてカメラが着いたら、コースの機械を片付ける
      if (!s.transition && !OUTDOOR.has(s.screen) && getRunView()) {
        const phase = store.getState().run.phase;
        if (phase !== 'running' && phase !== 'loading') setRunView(null);
      }
    }),
  );

  // 工房の仮置きの見本機:本物の試走をコースに出している間は消す
  const syncTrack = () => useSceneUi.getState().setTrackBusy(getRunView() !== null);
  syncTrack();
  unsubs.push(runViewStore.subscribe(syncTrack));

  // Esc・右クリック:試走・結果の画面では「設計に戻る」(scene の「戻る」より先に受ける)
  if (typeof window !== 'undefined') {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isEditable(e.target)) return;
      if (!OUTDOOR.has(useApp.getState().screen)) return;
      e.preventDefault();
      backToDesign(store);
    };
    const onContext = (e: MouseEvent) => {
      if (e.defaultPrevented || !OUTDOOR.has(useApp.getState().screen)) return;
      e.preventDefault();
      backToDesign(store);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('contextmenu', onContext, true);
    unsubs.push(() => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('contextmenu', onContext, true);
    });
  }

  setStationOverride('testRun', followOverride);
  setStationOverride('result', resultOverride);
  unsubs.push(() => {
    setStationOverride('testRun', null);
    setStationOverride('result', null);
  });

  return () => {
    unsubs.forEach((u) => u());
    unsubs.length = 0;
  };
}

function isEditable(t: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(t instanceof HTMLElement)) return false;
  return (
    t.isContentEditable ||
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT'
  );
}
