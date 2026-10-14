import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { useApp } from '@/app/store';
import { analyzeMechanism, type MechanismAnalysis } from '@/core/kinematics/analyze';
import {
  downloadDesign as browserDownloadDesign,
  pickDesignFile as browserPickDesignFile,
  readDesignFile,
} from '@/core/model/fileBrowser';
import type { Ghost } from '@/core/model/ghost';
import type { DesignReadResult } from '@/core/model/migrate';
import type { ShareDecodeResult, SharePayload, ShareRun } from '@/core/model/share';
import {
  clearShareFromLocation,
  copyShareUrl,
  readShareFromLocation,
} from '@/core/model/shareBrowser';
import type { DesignDoc, JointId, PartKind } from '@/core/model/types';
import { createRapierTerrain } from '@/core/sim';
import { createBrowserPersistence, onPageHide as browserOnPageHide } from '@/core/storage/browser';
import { debounce, type Debounced } from '@/core/storage/debounce';
import {
  createAutosaver,
  SANDBOX_SLOT,
  type Autosaver,
  type DesignSlot,
  type Persistence,
} from '@/core/storage/persistence';
import {
  advanceTutorial,
  getStage,
  initialProgress,
  isStageCleared,
  isStageUnlocked,
  isTutorialDone,
  nextHint,
  preflight as runPreflight,
  progressReducer,
  revealedHints,
  startDesign,
  startTutorial,
  suggestHint,
  syncUnlocks,
  tutorialAllowedParts,
  tutorialSnapshot,
  type PreflightResult,
  type Progress,
  type RevealedHint,
  type RunResult,
  type StageDef,
  type StageId,
  type TutorialEvent,
  type TutorialState,
  type TutorialStep,
} from '@/game';
import { useEditor } from '@/editor/store';
import { toShareRun } from '@/result/compare';
import {
  loadFailNotice,
  sameNotice,
  saveFailNotice,
  unlockNotices,
  type Notice,
  type NoticeInput,
} from './notices';
import { completeRun, LiveRun, type LiveRunOptions, type RunOutcome } from './run';
import { isSandboxStage, sandboxStage } from './sandbox';
import {
  isSettingsRecord,
  pickSettings,
  sameSettings,
  sanitizeSettings,
  type StoredSettings,
} from './settings';
import { planShareBoot } from './share';
import { createTerrainCache, type TerrainCache, type TerrainFactory } from './terrain';

/**
 * ゲームのセッション(FLOW-1〜5)。3D の工房・試走ビュー・HUD・`?dev=flow` が共通に使う
 * 「今どのステージを遊んでいて、試走がどうなったか」の状態と操作。
 *
 *  - 起動:`init()` で進行・設定を読み込み、共有リンクがあればその設計を開く
 *  - 設計:ステージ(またはサンドボックス)ごとのスロット。エディタ(useEditor)の変更を見て自動保存
 *  - 試走:`prepareRun`(試走前チェック)→ `startRun`(地形と機体を作る)→ ビューが
 *    `LiveRun.advance` で進める → `finishRun`(評価・記録・解放の通知・前回のゴースト)
 *  - チュートリアル・ヒント・共有・JSON の入出力・通知
 *
 * 画面(useApp.screen)は持たない。画面の切り替えは呼び出し側(App・scene)が行う。
 * 依存(保存先・URL・クリップボード・ファイル・地形の生成・時計)は init で差し替えられる(テスト用)。
 */

export interface SessionDeps {
  /** 保存先(既定:ブラウザの localStorage、使えなければメモリ) */
  persistence?: Persistence;
  /** URL フラグメントの共有を読む(既定:location.hash) */
  readShare?: () => ShareDecodeResult;
  /** 読み終えた共有フラグメントを URL から消す */
  clearShare?: () => void;
  /** 共有 URL を作ってクリップボードへ */
  copyShare?: (payload: SharePayload) => Promise<{ url: string; copied: boolean }>;
  downloadDesign?: (design: DesignDoc) => void;
  /** ファイル選択(キャンセルなら null) */
  pickDesignFile?: () => Promise<DesignReadResult | null>;
  /** 地形の生成(既定:Rapier) */
  createTerrain?: TerrainFactory;
  /** ページを離れるときに保存を済ませる(既定:pagehide / visibilitychange) */
  onPageHide?: (fn: () => void) => () => void;
  /** 時計(ms)。ヒントを促すまでの時間に使う */
  now?: () => number;
  /** 設計の自動保存の待ち時間(ms、既定 800) */
  autosaveMs?: number;
  /** 設定の保存の待ち時間(ms、既定 300) */
  settingsSaveMs?: number;
  /** 試走の設定(テスト用) */
  runOptions?: LiveRunOptions;
}

type ResolvedDeps = Required<Omit<SessionDeps, 'persistence' | 'runOptions'>> & {
  runOptions: LiveRunOptions;
};

export interface BootResult {
  /** 共有リンク:なし / 読み込んだ / 壊れていて無視した */
  share: 'none' | 'loaded' | 'invalid';
  /** 起動時に開いた設計のスロット(共有リンクを読んだとき) */
  slot: DesignSlot | null;
}

/** 試走の段階 */
export type RunPhase =
  | { phase: 'idle' }
  /** 地形(Rapier)を準備中 */
  | { phase: 'loading'; replay: boolean }
  | {
      phase: 'running';
      live: LiveRun;
      /** 転倒の瞬間の再生(記録しない) */
      replay: boolean;
      /** 並走させるゴースト:同じスロットの前回の試走、共有リンクの相手 */
      previousGhost: Ghost | null;
      opponentGhost: Ghost | null;
    }
  /** 結果を表示中 */
  | { phase: 'finished'; outcome: RunOutcome };

/** スロットごとの前回の試走(「前回の試走をゴーストで並走」) */
export interface LastRun {
  design: DesignDoc;
  ghost: Ghost;
  result: RunResult;
}

export interface SessionState {
  ready: boolean;
  /** false なら保存先がメモリ(再読み込みで消える) */
  persistent: boolean;
  progress: Progress;
  /** 開いている設計のスロット(ステージ id か SANDBOX_SLOT)。ステージ選択・ホームでは null */
  slot: DesignSlot | null;
  /** 開いているステージ(サンドボックスでは null) */
  stageId: StageId | null;
  notices: Notice[];
  /** 最後の試走前チェック(試走を押すまでは null。押した後は設計の変更に合わせて更新) */
  preflight: PreflightResult | null;
  run: RunPhase;
  lastOutcome: RunOutcome | null;
  lastRuns: Record<DesignSlot, LastRun>;
  /** 共有リンクの相手(記録とゴースト)と、それを読み込んだスロット */
  opponent: ShareRun | null;
  opponentGhost: Ghost | null;
  opponentSlot: DesignSlot | null;
  /** ステージごとのチュートリアルの状態 */
  tutorials: Record<StageId, TutorialState>;
  /** ステージごとに開いたヒントの数 */
  hints: Record<StageId, number>;
  /** ステージごとの失敗した試走の回数 */
  failedRuns: Record<StageId, number>;
  /** 次のヒントを促す(ボタンを光らせる)。失敗の回数で更新。時間での判定は isHintSuggested */
  hintSuggested: boolean;
  /** 今のステージを開いた時刻(deps.now、ms) */
  stageStartedAt: number;

  init(deps?: SessionDeps): BootResult;
  /** 購読を外し、待っている保存を済ませる(テスト・HMR 用) */
  dispose(): void;
  /** 待っている保存(設計・設定)を今すぐ行う */
  flush(): void;

  /** ステージを開く:保存した設計か最初の設計をエディタへ。未解放なら false(force で無視) */
  startStage(id: StageId, opts?: { design?: DesignDoc; force?: boolean }): boolean;
  openSandbox(opts?: { design?: DesignDoc }): void;
  /** ステージ選択へ戻る(設計は保存する) */
  leaveStage(): void;
  /** 設計を最初の状態に戻す(保存も消す) */
  resetDesign(): void;

  /** 試走前チェック。結果は state.preflight にも入る。スロットがなければ null */
  prepareRun(): PreflightResult | null;
  /** 試走を始める。チェックに通らなければ null(エラーは state.preflight) */
  startRun(): Promise<LiveRun | null>;
  /** 試走を終えて評価・記録する(走行中なら最後まで一気に進める) */
  finishRun(): RunOutcome | null;
  /** 試走をやめて設計に戻る(記録しない) */
  abortRun(): void;
  /** 前回の試走の終わり lead 秒前から 0.5 倍速で再生する(転倒の瞬間の再生、決定論で再現) */
  replayRun(lead?: number): Promise<LiveRun | null>;
  /** 結果を閉じて設計に戻る */
  dismissResult(): void;

  tutorialClick(): void;
  skipTutorial(): void;
  revealHint(): RevealedHint | null;

  /** 共有リンクをコピー(結果表示中は記録とゴーストも入れる) */
  shareCurrent(): Promise<{ url: string; copied: boolean } | null>;
  clearOpponent(): void;
  exportDesign(): void;
  /**
   * JSON ファイルを選んで読み込む。読み込めたら true。
   * (int-home で追加)file を渡すとダイアログを開かずにそれを読む(設定パネルのファイル選択から)
   */
  importDesign(file?: Blob): Promise<boolean>;

  pushNotice(notice: NoticeInput): void;
  dismissNotice(id: number): void;
  clearNotices(): void;
  /** 進行(クリア状況)を消す。設計のスロットは残す */
  resetProgress(): void;
  /** 見た遷移を進行に記録する(2 回目以降は短縮版) */
  markTransitionSeen(id: string): void;
}

/** 表示中の通知の上限(古いものから消す) */
export const MAX_NOTICES = 12;
/** 転倒の瞬間の再生で、終わりの何秒前から見せるか */
export const REPLAY_LEAD = 2.5;

const IDLE: RunPhase = { phase: 'idle' };

function defaultDeps(): ResolvedDeps {
  const browser = typeof window !== 'undefined';
  return {
    readShare: browser ? readShareFromLocation : () => ({ ok: false, reason: 'empty', errors: [] }),
    clearShare: browser ? clearShareFromLocation : () => {},
    copyShare: copyShareUrl,
    downloadDesign: browserDownloadDesign,
    pickDesignFile: browserPickDesignFile,
    createTerrain: createRapierTerrain,
    onPageHide: browser ? browserOnPageHide : () => () => {},
    now: () => Date.now(),
    autosaveMs: 800,
    settingsSaveMs: 300,
    runOptions: {},
  };
}

/** スロットのステージ(サンドボックスは進行に応じた StageDef) */
export function stageForSlot(slot: DesignSlot | null, progress: Progress): StageDef | null {
  if (slot === null) return null;
  if (slot === SANDBOX_SLOT) return sandboxStage(progress);
  return getStage(slot) ?? null;
}

export function createSessionStore(): UseBoundStore<StoreApi<SessionState>> {
  return create<SessionState>()((set, get) => {
    // ---- 状態に置かない実行時のもの ----
    let deps: ResolvedDeps = defaultDeps();
    let persistence: Persistence | null = null;
    let autosaver: Autosaver | null = null;
    let saveSettings: Debounced<[StoredSettings]> | null = null;
    let unsubs: (() => void)[] = [];
    let terrains: TerrainCache | null = null;
    let boot: BootResult | null = null;
    /** エディタに読み込んだ設計(これと同じなら自動保存しない) */
    let loadedDesign: DesignDoc | null = null;
    /** 試走の世代(やめた試走の地形の読み込みが後から来ても無視する) */
    let runToken = 0;
    const runContext = new WeakMap<
      LiveRun,
      { analysis: MechanismAnalysis; preflight: PreflightResult }
    >();
    let noticeSeq = 0;

    const stage = () => stageForSlot(get().slot, get().progress);

    const pushNotice = (n: NoticeInput) => {
      const list = get().notices;
      if (list.some((m) => sameNotice(m, n))) return;
      const next = [...list, { ...n, id: ++noticeSeq }];
      set({ notices: next.slice(Math.max(0, next.length - MAX_NOTICES)) });
    };

    const saveProgress = (p: Progress) => {
      if (!persistence) return;
      const r = persistence.saveProgress(p);
      if (!r.ok) pushNotice(saveFailNotice(r.reason));
    };

    const advanceTut = (event: TutorialEvent) => {
      const s = get();
      const steps = s.stageId ? getStage(s.stageId)?.tutorial : undefined;
      const st = s.stageId ? s.tutorials[s.stageId] : undefined;
      if (!s.stageId || !steps || !st || isTutorialDone(steps, st)) return;
      const next = advanceTutorial(steps, st, event);
      if (next !== st) set({ tutorials: { ...s.tutorials, [s.stageId]: next } });
    };

    const updateHintSuggested = () => {
      const v = isHintSuggested(get(), deps.now());
      if (v && !get().hintSuggested) {
        pushNotice({ kind: 'hint', severity: 'info', key: 'flow.hint.suggest' });
      }
      set({ hintSuggested: v });
    };

    /** 走行中・準備中の試走を捨てる */
    const cancelRun = () => {
      runToken++;
      if (get().run.phase !== 'idle') set({ run: IDLE });
    };

    const enterSlot = (slot: DesignSlot, st: StageDef, given?: DesignDoc) => {
      cancelRun();
      autosaver?.flush();
      const design = given ?? persistence?.loadDesign(slot) ?? startDesign(st);
      const s = get();
      const isStage = slot !== SANDBOX_SLOT;
      let tutorials = s.tutorials;
      // チュートリアルはステージの設計(保存したもの・最初のもの)で始める。共有リンクの機械では始めない
      if (
        isStage &&
        !given &&
        st.tutorial &&
        st.tutorial.length > 0 &&
        !tutorials[slot] &&
        !isStageCleared(s.progress, slot)
      ) {
        tutorials = { ...tutorials, [slot]: startTutorial(st.tutorial, tutorialSnapshot(design)) };
      }
      set({
        slot,
        stageId: isStage ? slot : null,
        preflight: null,
        tutorials,
        stageStartedAt: deps.now(),
        hintSuggested: false,
      });
      loadedDesign = design;
      editor().replaceDesign(design);
      updateHintSuggested();
    };

    /** エディタの設計が変わった:自動保存、試走前チェックの更新、チュートリアル */
    const onDesign = (design: DesignDoc) => {
      const s = get();
      if (s.slot === null) return;
      if (design !== loadedDesign) autosaver?.schedule(s.slot, design);
      const st = stage();
      let analysis: MechanismAnalysis | null = null;
      const analyze = () => (analysis ??= analyzeMechanism(design));
      if (s.preflight && st) set({ preflight: runPreflight(st, design, { analysis: analyze() }) });
      const steps = s.stageId ? getStage(s.stageId)?.tutorial : undefined;
      const tut = s.stageId ? s.tutorials[s.stageId] : undefined;
      if (steps && tut && !isTutorialDone(steps, tut)) {
        advanceTut({ type: 'design', snapshot: tutorialSnapshot(design, analyze()) });
      }
    };

    const loadTerrain = async (st: StageDef, token: number) => {
      terrains ??= createTerrainCache(deps.createTerrain);
      try {
        const terrain = await terrains.get(st);
        return token === runToken ? terrain : null;
      } catch {
        if (token === runToken) {
          set({ run: IDLE });
          pushNotice({ kind: 'run', severity: 'error', key: 'flow.run.terrainFailed' });
        }
        return null;
      }
    };

    return {
      ready: false,
      persistent: false,
      progress: initialProgress(),
      slot: null,
      stageId: null,
      notices: [],
      preflight: null,
      run: IDLE,
      lastOutcome: null,
      lastRuns: {},
      opponent: null,
      opponentGhost: null,
      opponentSlot: null,
      tutorials: {},
      hints: {},
      failedRuns: {},
      hintSuggested: false,
      stageStartedAt: 0,

      init(input = {}) {
        if (boot) return boot;
        const { persistence: given, runOptions, ...rest } = input;
        deps = { ...defaultDeps(), ...stripUndefined(rest), runOptions: runOptions ?? {} };
        const p = given ?? createBrowserPersistence();
        persistence = p;

        // 進行(読み込んだものは解放を導き直して修復する)
        const progress = syncUnlocks(p.loadProgress());
        set({ ready: true, persistent: p.persistent, progress });
        if (!p.persistent) pushNotice(saveFailNotice('unavailable'));

        // 設定(useApp)。読み込んで反映し、以後の変更を保存する
        const stored = p.loadSettings(isSettingsRecord, {});
        const app = useApp.getState();
        const loaded = sanitizeSettings(stored, app.settings);
        if (!sameSettings(loaded, app.settings)) app.setSettings(loaded);
        saveSettings = debounce((v: StoredSettings) => {
          const r = p.saveSettings(v);
          if (!r.ok) pushNotice(saveFailNotice(r.reason));
        }, deps.settingsSaveMs);
        unsubs.push(
          useApp.subscribe((st, prev) => {
            if (st.settings !== prev.settings && !sameSettings(st.settings, prev.settings)) {
              saveSettings?.(pickSettings(st.settings));
            }
          }),
        );

        // 設計の自動保存
        autosaver = createAutosaver(p, {
          waitMs: deps.autosaveMs,
          onResult: (_slot, r) => {
            if (!r.ok) pushNotice(saveFailNotice(r.reason));
          },
        });
        unsubs.push(
          useEditor.subscribe((st, prev) => {
            if (st.design !== prev.design) onDesign(st.design);
          }),
        );
        unsubs.push(deps.onPageHide(() => get().flush()));

        // 共有リンク
        boot = { share: 'none', slot: null };
        const plan = planShareBoot(deps.readShare(), progress);
        if (plan.kind !== 'none') deps.clearShare();
        if (plan.kind === 'invalid') {
          plan.notices.forEach(pushNotice);
          boot = { share: 'invalid', slot: null };
        } else if (plan.kind === 'load') {
          set({ opponent: plan.opponent, opponentGhost: plan.opponentGhost });
          if (plan.stageId) get().startStage(plan.stageId, { design: plan.design, force: true });
          else get().openSandbox({ design: plan.design });
          set({ opponentSlot: get().slot });
          plan.notices.forEach(pushNotice);
          boot = { share: 'loaded', slot: get().slot };
        }
        return boot;
      },

      dispose() {
        get().flush();
        unsubs.forEach((u) => u());
        unsubs = [];
        saveSettings?.cancel();
        autosaver?.cancel();
        terrains?.clear();
        terrains = null;
        runToken++;
        boot = null;
        set({ ready: false, run: IDLE });
      },

      flush() {
        autosaver?.flush();
        saveSettings?.flush();
      },

      startStage(id, opts = {}) {
        const st = getStage(id);
        if (!st) return false;
        if (!opts.force && !isStageUnlocked(get().progress, id)) return false;
        enterSlot(id, st, opts.design);
        return true;
      },

      openSandbox(opts = {}) {
        enterSlot(SANDBOX_SLOT, sandboxStage(get().progress), opts.design);
      },

      leaveStage() {
        cancelRun();
        autosaver?.flush();
        loadedDesign = null;
        set({ slot: null, stageId: null, preflight: null, hintSuggested: false });
      },

      resetDesign() {
        const s = get();
        const st = stage();
        if (!st || s.slot === null) return;
        cancelRun();
        autosaver?.cancel();
        persistence?.removeDesign(s.slot);
        const design = startDesign(st);
        if (s.stageId && st.tutorial && st.tutorial.length > 0) {
          const tut = s.tutorials[s.stageId];
          if (tut && !isTutorialDone(st.tutorial, tut)) {
            set({
              tutorials: {
                ...s.tutorials,
                [s.stageId]: startTutorial(st.tutorial, tutorialSnapshot(design)),
              },
            });
          }
        }
        set({ preflight: null });
        loadedDesign = design;
        editor().replaceDesign(design);
      },

      prepareRun() {
        const st = stage();
        if (!st) return null;
        const design = editor().design;
        const analysis = analyzeMechanism(design);
        const result = runPreflight(st, design, { analysis });
        set({ preflight: result });
        return result;
      },

      async startRun() {
        const r = get().run;
        if (r.phase === 'loading') return null;
        if (r.phase === 'running' && !r.replay) return r.live;
        const st = stage();
        const slot = get().slot;
        if (!st || slot === null) return null;
        const design = editor().design;
        const analysis = analyzeMechanism(design);
        const pf = runPreflight(st, design, { analysis });
        set({ preflight: pf });
        if (!pf.ok) {
          set({ run: IDLE });
          return null;
        }
        autosaver?.flush();
        advanceTut({ type: 'testRun' });
        const token = ++runToken;
        set({ run: { phase: 'loading', replay: false } });
        const terrain = await loadTerrain(st, token);
        if (!terrain) return null;
        const live = new LiveRun(st, design, terrain, deps.runOptions);
        runContext.set(live, { analysis, preflight: pf });
        const s = get();
        set({
          run: {
            phase: 'running',
            live,
            replay: false,
            previousGhost: s.lastRuns[slot]?.ghost ?? null,
            opponentGhost: s.opponentSlot === slot ? s.opponentGhost : null,
          },
        });
        return live;
      },

      finishRun() {
        const r = get().run;
        if (r.phase !== 'running') return null;
        const live = r.live;
        if (!live.done) live.runToEnd();
        if (r.replay) {
          const o = get().lastOutcome;
          set({ run: o ? { phase: 'finished', outcome: o } : IDLE });
          return o;
        }
        const s = get();
        const slot = s.slot ?? live.stage.id;
        const ctx = runContext.get(live);
        const { outcome, progress } = completeRun({
          stage: live.stage,
          slot,
          design: live.design,
          summary: live.summary(),
          ghost: live.ghost(),
          progress: s.progress,
          ...(ctx ? { analysis: ctx.analysis, preflight: ctx.preflight } : {}),
        });
        const isStage = !isSandboxStage(live.stage);
        const failedRuns =
          isStage && !outcome.result.cleared
            ? { ...s.failedRuns, [slot]: (s.failedRuns[slot] ?? 0) + 1 }
            : s.failedRuns;
        if (progress !== s.progress) saveProgress(progress);
        set({
          run: { phase: 'finished', outcome },
          lastOutcome: outcome,
          progress,
          failedRuns,
          lastRuns: {
            ...s.lastRuns,
            [slot]: { design: outcome.design, ghost: outcome.ghost, result: outcome.result },
          },
        });
        unlockNotices(outcome.unlocks).forEach(pushNotice);
        updateHintSuggested();
        return outcome;
      },

      abortRun() {
        cancelRun();
      },

      async replayRun(lead = REPLAY_LEAD) {
        const o = get().lastOutcome;
        if (!o) return null;
        const token = ++runToken;
        set({ run: { phase: 'loading', replay: true } });
        const terrain = await loadTerrain(o.stage, token);
        if (!terrain) return null;
        const live = new LiveRun(o.stage, o.design, terrain, deps.runOptions);
        const from = Math.max(0, o.summary.time - Math.max(0, lead));
        while (!live.done && live.time + live.dt / 2 < from) live.step();
        live.speed = 0.5;
        set({
          run: { phase: 'running', live, replay: true, previousGhost: null, opponentGhost: null },
        });
        return live;
      },

      dismissResult() {
        if (get().run.phase === 'finished') set({ run: IDLE });
      },

      tutorialClick() {
        advanceTut({ type: 'click' });
      },

      skipTutorial() {
        const s = get();
        const steps = s.stageId ? getStage(s.stageId)?.tutorial : undefined;
        const st = s.stageId ? s.tutorials[s.stageId] : undefined;
        if (!s.stageId || !steps || !st) return;
        set({ tutorials: { ...s.tutorials, [s.stageId]: { ...st, index: steps.length } } });
      },

      revealHint() {
        const st = stage();
        if (!st || isSandboxStage(st)) return null;
        const count = get().hints[st.id] ?? 0;
        const hint = nextHint(st, count);
        if (!hint) return null;
        set({ hints: { ...get().hints, [st.id]: count + 1 }, hintSuggested: false });
        updateHintSuggested();
        return hint;
      },

      async shareCurrent() {
        const s = get();
        const o = s.run.phase === 'finished' ? s.run.outcome : null;
        const payload: SharePayload = o
          ? { design: o.design, run: toShareRun(o.result), ghost: o.ghost }
          : { design: editor().design };
        try {
          const r = await deps.copyShare(payload);
          pushNotice(
            r.copied
              ? { kind: 'share', severity: 'success', key: 'model.share.copied' }
              : { kind: 'share', severity: 'warn', key: 'model.share.copyFailed' },
          );
          return r;
        } catch {
          pushNotice({ kind: 'share', severity: 'error', key: 'flow.share.failed' });
          return null;
        }
      },

      clearOpponent() {
        set({ opponent: null, opponentGhost: null, opponentSlot: null });
      },

      exportDesign() {
        deps.downloadDesign(editor().design);
      },

      async importDesign(file) {
        let r: DesignReadResult | null;
        try {
          r = file ? await readDesignFile(file) : await deps.pickDesignFile();
        } catch {
          r = { ok: false, reason: 'corrupt', errors: [] };
        }
        if (!r) return false;
        if (!r.ok) {
          pushNotice(loadFailNotice(r.reason, 'file'));
          return false;
        }
        const design = r.design;
        if (get().slot === null) get().openSandbox({ design });
        else {
          cancelRun();
          set({ preflight: null });
          editor().replaceDesign(design);
        }
        // 読み込んだ設計はすぐ保存する(エディタで開いたままの最初の設計とは違う)
        const slot = get().slot;
        if (slot !== null) autosaver?.schedule(slot, design);
        pushNotice({
          kind: 'file',
          severity: 'success',
          key: 'flow.file.imported',
          params: { name: design.name },
        });
        return true;
      },

      pushNotice,

      dismissNotice(id) {
        set({ notices: get().notices.filter((n) => n.id !== id) });
      },

      clearNotices() {
        set({ notices: [] });
      },

      resetProgress() {
        cancelRun();
        autosaver?.flush();
        const progress = progressReducer(get().progress, { type: 'reset' });
        saveProgress(progress);
        loadedDesign = null;
        set({
          progress,
          slot: null,
          stageId: null,
          preflight: null,
          lastOutcome: null,
          lastRuns: {},
          tutorials: {},
          hints: {},
          failedRuns: {},
          hintSuggested: false,
        });
        pushNotice({ kind: 'progress', severity: 'info', key: 'flow.progress.reset' });
      },

      markTransitionSeen(id) {
        const before = get().progress;
        const progress = progressReducer(before, { type: 'seeTransition', id });
        if (progress === before) return;
        set({ progress });
        saveProgress(progress);
      },
    };
  });
}

/** エディタのストア(設計の唯一の正)の今の状態 */
const editor = () => useEditor.getState();

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  return out;
}

// ---- 読み出し(selector)----

/** 開いているステージ(サンドボックスなら進行に応じた StageDef) */
export function selectStage(s: SessionState): StageDef | null {
  return stageForSlot(s.slot, s.progress);
}

export interface TutorialView {
  steps: TutorialStep[];
  state: TutorialState;
  step: TutorialStep;
  /** 0 始まり */
  index: number;
  total: number;
  /** 吹き出しの文言(i18n キー) */
  textKey: string;
  /** 「次へ」を押すと進むステップ */
  waitsForClick: boolean;
}

// selector の結果はキャッシュして同じ参照を返す(useSession(selector) でそのまま使えるように)
const tutorialViews = new WeakMap<TutorialState, TutorialView | null>();
const allowedCache = new WeakMap<StageDef, Map<TutorialState | null, PartKind[]>>();
const hintCache = new WeakMap<StageDef, Map<number, RevealedHint[]>>();

/** 進行中のチュートリアル(なければ・終わっていれば null) */
export function selectTutorial(s: SessionState): TutorialView | null {
  if (!s.stageId) return null;
  const steps = getStage(s.stageId)?.tutorial;
  const state = s.tutorials[s.stageId];
  if (!steps || !state) return null;
  const cached = tutorialViews.get(state);
  if (cached !== undefined) return cached;
  let view: TutorialView | null = null;
  if (!isTutorialDone(steps, state)) {
    const step = steps[state.index]!;
    view = {
      steps,
      state,
      step,
      index: state.index,
      total: steps.length,
      textKey: step.key,
      waitsForClick: step.until.kind === 'click',
    };
  }
  tutorialViews.set(state, view);
  return view;
}

const NO_PARTS: PartKind[] = [];
/** エディタに渡す使える部品(ステージの部品 ∩ チュートリアルで渡した部品) */
export function selectAllowedParts(s: SessionState): PartKind[] {
  const st = selectStage(s);
  if (!st) return NO_PARTS;
  const tut = s.stageId ? (s.tutorials[s.stageId] ?? null) : null;
  let byState = allowedCache.get(st);
  if (!byState) allowedCache.set(st, (byState = new Map()));
  let parts = byState.get(tut);
  if (!parts) {
    const next = tutorialAllowedParts(st, tut);
    // 同じ部品の組なら前の配列を使い回す(設計の変更ごとに新しい配列にしない)
    parts = [...byState.values()].find((p) => sameList(p, next)) ?? next;
    if (byState.size > 64) byState.clear();
    byState.set(tut, parts);
  }
  return parts;
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const NO_JOINTS: JointId[] = [];
/** エディタで動かせないジョイント */
export function selectLockedJoints(s: SessionState): JointId[] {
  const st = selectStage(s);
  return st?.lockedJoints ?? NO_JOINTS;
}

const NO_HINTS: RevealedHint[] = [];
/** 開いたヒント(レベル順) */
export function selectRevealedHints(s: SessionState): RevealedHint[] {
  const st = selectStage(s);
  if (!st || isSandboxStage(st)) return NO_HINTS;
  const n = s.hints[st.id] ?? 0;
  let byCount = hintCache.get(st);
  if (!byCount) hintCache.set(st, (byCount = new Map()));
  let list = byCount.get(n);
  if (!list) byCount.set(n, (list = revealedHints(st, n)));
  return list;
}

/** 設計ビューに重ねるヒントの影(開いた中で一番進んだもの) */
export function selectHintGhost(s: SessionState): DesignDoc | null {
  const hints = selectRevealedHints(s);
  for (let i = hints.length - 1; i >= 0; i--) {
    const h = hints[i]!.hint;
    if (h.kind === 'ghost') return h.design;
  }
  return null;
}

/** 次のヒントがあるか */
export function selectHasNextHint(s: SessionState): boolean {
  const st = selectStage(s);
  return !!st && !isSandboxStage(st) && nextHint(st, s.hints[st.id] ?? 0) !== null;
}

/** 今のスロットの対戦相手の記録(別のスロットなら null) */
export function selectOpponent(s: SessionState): ShareRun | null {
  return s.slot !== null && s.slot === s.opponentSlot ? s.opponent : null;
}

export function selectOpponentGhost(s: SessionState): Ghost | null {
  return s.slot !== null && s.slot === s.opponentSlot ? s.opponentGhost : null;
}

/** 今のスロットの前回の試走のゴースト */
export function selectPreviousGhost(s: SessionState): Ghost | null {
  return s.slot !== null ? (s.lastRuns[s.slot]?.ghost ?? null) : null;
}

/** 次のヒントを促すか(失敗の回数か、ステージを開いてからの時間で) */
export function isHintSuggested(s: SessionState, nowMs: number): boolean {
  const st = selectStage(s);
  if (!st || isSandboxStage(st)) return false;
  return suggestHint(st, {
    revealed: s.hints[st.id] ?? 0,
    failedRuns: s.failedRuns[st.id] ?? 0,
    seconds: Math.max(0, (nowMs - s.stageStartedAt) / 1000),
  });
}

/** アプリ全体のセッション */
export const useSession = createSessionStore();
