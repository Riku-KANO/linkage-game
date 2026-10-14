import type { StageId } from '@/game';
import { setMenuHandler } from '@/scene/home/menu';
import type { Screen } from '@/ui/tokens';
import { activateHomeItem, noteOpenedSlot, openStage } from './actions';
import { useSession, type BootResult, type SessionDeps } from './flow';
import { seenAfterStoredChange, seenToRecord } from './seen';
import { installSettingsSync, rememberSlot, type SettingsSyncOptions } from './settings';
import { useApp } from './store';
import { installWorldBridge } from './worldBridge';

/**
 * アプリの起動(INT-5)。ゲームのセッション(flow)を始め、画面状態(useApp)・保存・3D の工房をつなぐ。
 * 何度呼んでも最初の 1 回だけ効き、同じ BootResult を返す(useSession.init も冪等なので、
 * 他のストリームが先に init() を呼んでいてもよい。そのときも共有リンクの結果は同じものが返る)。
 *
 *  1. useSession.init():進行・設定の読み込み、共有リンク
 *  2. 設定:利用者の選択(prefs)と自動判定から決め直し、ミュートを音へ(settings.ts)
 *  3. 見た遷移:progress.seenTransitions ⇄ useApp.seenTransitions(再読み込みしても 2 回目以降は短く)
 *  4. 最後に開いたスロットを覚える(「続きから」)
 *  5. 設計・試走・結果からホーム・ステージ選択へ戻ったらステージを閉じる(leaveStage:保存して slot を空に)
 *  6. 共有リンクで起動したら、ロゴ(T-00)の後に作業台の設計画面へ(T-07。Esc でホームに戻れる)
 *  7. ホームのメニュー(工房の物体とテキストメニュー)の処理、ジオラマ(world)への流し込み
 */

export interface BootOptions {
  /** useSession.init に渡す依存(テスト用) */
  session?: SessionDeps;
  /** 設定の同期の依存(テスト用) */
  settings?: SettingsSyncOptions;
  /** <html data-screen data-slot> に今の画面とスロットを出す(既定 true。E2E と CSS 用) */
  markDocument?: boolean;
}

let booted: { result: BootResult; stop: () => void } | null = null;

export function bootApp(opts: BootOptions = {}): BootResult {
  if (booted) return booted.result;
  const result = useSession.getState().init(opts.session);
  const stops: (() => void)[] = [
    installSettingsSync(opts.settings),
    installSeenSync(),
    installSlotMemory(),
    installScreenSync(opts.markDocument ?? true),
    installWorldBridge((id) => void openStage(id)),
  ];
  setMenuHandler(activateHomeItem);
  stops.push(() => setMenuHandler(null));
  if (result.share === 'loaded' && result.slot !== null) {
    stops.push(routeShareBoot(useSession.getState().stageId));
  }
  booted = { result, stop: () => stops.forEach((f) => f()) };
  return result;
}

/** 購読を外す(テスト・HMR 用)。もう一度 bootApp() できる。セッションの dispose は呼び出し側で */
export function disposeApp(): void {
  booted?.stop();
  booted = null;
}

/** 見た遷移の同期(seen.ts) */
function installSeenSync(): () => void {
  const session = () => useSession.getState();
  const record = (app: ReadonlySet<string>) => {
    for (const id of seenToRecord(app, session().progress.seenTransitions)) {
      session().markTransitionSeen(id);
    }
  };
  const seeded = seenAfterStoredChange(
    null,
    session().progress.seenTransitions,
    useApp.getState().seenTransitions,
  );
  if (seeded) useApp.setState({ seenTransitions: seeded });
  record(useApp.getState().seenTransitions);

  const a = useApp.subscribe((s, prev) => {
    if (s.seenTransitions !== prev.seenTransitions) record(s.seenTransitions);
  });
  const b = useSession.subscribe((s, prev) => {
    if (s.progress.seenTransitions === prev.progress.seenTransitions) return;
    const next = seenAfterStoredChange(
      prev.progress.seenTransitions,
      s.progress.seenTransitions,
      useApp.getState().seenTransitions,
    );
    if (next) useApp.setState({ seenTransitions: next });
  });
  return () => {
    a();
    b();
  };
}

/** 開いたスロットを「続きから」のために覚える */
function installSlotMemory(): () => void {
  const note = (slot: string | null) => {
    if (slot === null) return;
    noteOpenedSlot(slot);
    rememberSlot(slot);
  };
  note(useSession.getState().slot);
  const unsub = useSession.subscribe((s, prev) => {
    if (s.slot !== prev.slot) note(s.slot);
  });
  return () => {
    unsub();
    noteOpenedSlot(null);
  };
}

/** ステージの中の画面(ここからホーム・ステージ選択へ出たらステージを閉じる) */
const STAGE_SCREENS: readonly Screen[] = ['design', 'testRun', 'result'];
const OUTSIDE_SCREENS: readonly Screen[] = ['home', 'stageSelect'];

function installScreenSync(markDocument: boolean): () => void {
  const root = markDocument && typeof document !== 'undefined' ? document.documentElement : null;
  const mark = () => {
    if (!root) return;
    root.dataset.screen = useApp.getState().screen;
    root.dataset.slot = useSession.getState().slot ?? '';
  };
  mark();
  const a = useApp.subscribe((s, prev) => {
    if (s.screen === prev.screen) return;
    if (STAGE_SCREENS.includes(prev.screen) && OUTSIDE_SCREENS.includes(s.screen)) {
      if (useSession.getState().slot !== null) useSession.getState().leaveStage();
    }
    mark();
  });
  const b = useSession.subscribe((s, prev) => {
    if (s.slot !== prev.slot) mark();
  });
  return () => {
    a();
    b();
  };
}

/**
 * 共有リンクで起動した:ロゴが組み上がりカメラが引き終えたら(T-00 の後)、作業台の設計画面へ(T-07)。
 * それより先にプレイヤーが他の画面へ移ったら何もしない。
 */
function routeShareBoot(stageId: StageId | null): () => void {
  const toDesign = () => useApp.getState().go('design', { stageId });
  const s0 = useApp.getState();
  if (s0.screen === 'home' && !s0.transition) {
    toDesign();
    return () => {};
  }
  const unsub = useApp.subscribe((s) => {
    if (s.screen === 'boot') return;
    if (s.screen !== 'home') {
      unsub();
      return;
    }
    if (!s.transition) {
      unsub();
      toDesign();
    }
  });
  return unsub;
}
