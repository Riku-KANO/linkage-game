import type { StoreApi, UseBoundStore } from 'zustand';
import { sandboxStage, useSession, type LiveRun, type SessionState } from '@/app/flow';
import { useApp } from '@/app/store';
import { focusWorldStage } from '@/app/worldBridge';
import type { StageId } from '@/game';
import { useEditor } from '@/editor/store';
import type { Screen } from '@/ui/tokens';
import { freeDesignForStage } from './placement';
import { getRunView, setPreflightOpen } from './runView';

/**
 * 試走・結果の画面の操作(INT-2 / INT-3)。flow のセッション(useSession)を進め、画面
 * (useApp.go)を切り替える。flow は useApp.go を呼ばないので、画面を変えるのはここだけ。
 * ほかの統合(設計画面の試走ボタンなど)はこれを呼ぶ。
 */

export type SessionStore = UseBoundStore<StoreApi<SessionState>>;

function go(to: Screen, opts?: { stageId?: StageId | null }): void {
  useApp.getState().go(to, opts);
}

/** 設計 ⇄ 試走 ⇄ 結果 の行き来(履歴に積もる画面) */
const RUN_LOOP: ReadonlySet<Screen> = new Set<Screen>(['design', 'testRun', 'result']);

/**
 * 試走の行き来を終えて設計・ステージ選択に出たら、履歴の末尾から行き来の分を除く。
 * 「戻る」(Esc・右クリック)が結果や試走へ逆戻りせず、試走の前にいた画面(ホーム・ステージ選択)へ戻るように。
 */
export function trimRunHistory(): void {
  const { history } = useApp.getState();
  let n = history.length;
  while (n > 0 && RUN_LOOP.has(history[n - 1]!)) n--;
  if (n !== history.length) useApp.setState({ history: history.slice(0, n) });
}

/** 試走の行き来から設計画面へ */
function goDesign(): void {
  go('design');
  trimRunHistory();
}

/**
 * 開いている設計のスロットを用意する。ステージを開いていなければ、選んであるステージ
 * (useApp.stageId)を開き、それもなければエディタの今の設計をサンドボックスに入れる
 * (「自由に設計」:脚列が未解放なら既定の脚列に合わせる)。スロットがあれば何もしない。
 */
export function ensureSlot(store: SessionStore = useSession): void {
  const s = store.getState();
  if (s.slot !== null) return;
  const stageId = useApp.getState().stageId;
  if (stageId && s.startStage(stageId)) return;
  const design = freeDesignForStage(useEditor.getState().design, sandboxStage(s.progress));
  s.openSandbox({ design });
}

/**
 * 試走を始める(同期部分):試走前チェックに通れば地形の準備を始めて Promise を返す。
 * 通らなければ null(問題は state.preflight に入り、設計画面に知らせる)。
 */
function kickRun(store: SessionStore): Promise<LiveRun | null> | null {
  ensureSlot(store);
  const pending = store.getState().startRun();
  const phase = store.getState().run.phase;
  if (phase === 'loading' || phase === 'running') {
    setPreflightOpen(false);
    return pending;
  }
  void pending;
  setPreflightOpen(true);
  return null;
}

/**
 * 設計画面の「試走」(INT-1 から呼ぶ)。試走前チェックに通れば試走画面へ移り(T-03)、
 * 機体ができたら true。通らなければ設計画面のまま問題を出して false。
 */
export async function beginTestRun(store: SessionStore = useSession): Promise<boolean> {
  const pending = kickRun(store);
  if (!pending) return false;
  go('testRun');
  return (await pending) !== null;
}

/**
 * 試走画面に直接来た(useApp.go('testRun') だけ呼ばれた)ときに試走を始める。
 * チェックに通らなければ設計画面へ戻して問題を出す。走行中・準備中なら何もしない。
 */
export async function startRunHere(store: SessionStore = useSession): Promise<boolean> {
  const phase = store.getState().run.phase;
  if (phase === 'loading' || phase === 'running') return true;
  const pending = kickRun(store);
  if (!pending) {
    goDesign();
    return false;
  }
  return (await pending) !== null;
}

/** ↺・R・もう一度:今の設計で新しい試走を始める(試走画面へ) */
export async function restartRun(store: SessionStore = useSession): Promise<boolean> {
  const s = store.getState();
  if (s.run.phase === 'running' || s.run.phase === 'loading') s.abortRun();
  const pending = kickRun(store);
  if (!pending) {
    goDesign();
    return false;
  }
  go('testRun');
  return (await pending) !== null;
}

/** 結果へ:走行中なら最後まで一気に計算して評価し、結果画面へ(T-04) */
export function finishToResult(store: SessionStore = useSession): boolean {
  const view = getRunView();
  const run = store.getState().run;
  if (run.phase !== 'running') return false;
  if (view && view.live === run.live) view.handedOver = true;
  const outcome = store.getState().finishRun();
  // finishRun が LiveRun を最後まで進めたので、描画を最後の姿勢に合わせ、評価が済んだので余韻を始める
  if (view && view.live === run.live) {
    view.controller.sync();
    view.controller.startCoast();
  }
  if (!outcome) return false;
  go('result');
  return true;
}

/** 設計に戻る(試走をやめる・結果を閉じる)。結果からは T-05 */
export function backToDesign(store: SessionStore = useSession): void {
  const s = store.getState();
  if (s.run.phase === 'running' || s.run.phase === 'loading') s.abortRun();
  else if (s.run.phase === 'finished') s.dismissResult();
  goDesign();
}

/**
 * 次のステージへ(T-06:結果 → ステージ選択。機械がジオラマの上を次のステージまで歩く)。
 * ステージ選択では次のステージを選んだ状態にする(ジオラマがあればその目印も)。今のステージは
 * ステージ選択に出たところで app の boot が閉じる(leaveStage)。
 */
export function goNextStage(next: StageId, store: SessionStore = useSession): void {
  const s = store.getState();
  if (s.run.phase === 'finished') s.dismissResult();
  go('stageSelect', { stageId: next });
  trimRunHistory();
  focusWorldStage(next);
}

/** 転倒の瞬間を見る:終わりの少し前から ×0.5 で再生し(試走画面)、終わったら結果へ戻る */
export async function replayFall(store: SessionStore = useSession): Promise<boolean> {
  const pending = store.getState().replayRun();
  if (store.getState().run.phase !== 'loading' && store.getState().run.phase !== 'running') {
    return (await pending) !== null;
  }
  go('testRun');
  return (await pending) !== null;
}
