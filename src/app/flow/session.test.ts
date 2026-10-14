import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '@/app/store';
import { syntheticWalkGhost } from '@/core/model/ghostFixture';
import { decodeShare, encodeShare, type SharePayload } from '@/core/model/share';
import { createEmptyDesign, type DesignDoc } from '@/core/model/types';
import {
  createPersistence,
  SANDBOX_SLOT,
  storageKeys,
  type StorageLike,
} from '@/core/storage/persistence';
import { useEditor } from '@/editor/store';
import {
  getStage,
  initialProgress,
  isStageUnlocked,
  nextStageId,
  recordResult,
  startDesign,
  type RunResult,
} from '@/game';
import {
  createSessionStore,
  isHintSuggested,
  selectAllowedParts,
  selectHintGhost,
  selectLockedJoints,
  selectOpponent,
  selectPreviousGhost,
  selectRevealedHints,
  selectStage,
  selectTutorial,
  type SessionDeps,
} from './session';

const DEFAULT_SETTINGS = { reducedMotion: false, lowPerf: false, volume: 0.8 };
const c1s1 = getStage('c1-s1')!;
const c1s2 = nextStageId('c1-s1')!;

interface FakeStorage extends StorageLike {
  data: Map<string, string>;
  failWith(e: unknown): void;
}

function fakeStorage(init: Record<string, string> = {}): FakeStorage {
  const data = new Map(Object.entries(init));
  let failure: unknown = null;
  return {
    data,
    failWith(e) {
      failure = e;
    },
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (failure) throw failure;
      data.set(k, String(v));
    },
    removeItem: (k) => void data.delete(k),
  };
}

const quotaError = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });

const cleared = (stageId: string): RunResult => ({
  stageId,
  cleared: true,
  reason: null,
  time: 4,
  parts: 10,
  cost: 500,
  energy: 50,
  distance: 1.6,
  medals: { time: 'gold', parts: 'gold', cost: 'gold', energy: 'gold' },
});

let store = createSessionStore();
let storage = fakeStorage();

function boot(deps: SessionDeps = {}, s: FakeStorage = storage) {
  storage = s;
  store = createSessionStore();
  return store.getState().init({ persistence: createPersistence(s), ...deps });
}

const S = () => store.getState();
const editor = () => useEditor.getState();
const savedDesign = (slot: string): DesignDoc | null => createPersistence(storage).loadDesign(slot);

beforeEach(() => {
  useApp.setState({ settings: { ...DEFAULT_SETTINGS } });
  useEditor.getState().replaceDesign(createEmptyDesign());
  storage = fakeStorage();
});
afterEach(() => {
  store.getState().dispose();
});

describe('session startup (FLOW-1)', () => {
  it('loads progress and settings, ignoring broken settings fields', () => {
    const progress = recordResult(initialProgress(), cleared('c1-s1'));
    boot(
      {},
      fakeStorage({
        [storageKeys.progress]: JSON.stringify(progress),
        [storageKeys.settings]: JSON.stringify({ volume: 0.3, lowPerf: true, reducedMotion: 'x' }),
      }),
    );
    expect(S().ready).toBe(true);
    expect(S().persistent).toBe(true);
    expect(S().progress.best['c1-s1']?.cleared).toBe(true);
    expect(isStageUnlocked(S().progress, c1s2)).toBe(true);
    expect(useApp.getState().settings).toEqual({
      volume: 0.3,
      lowPerf: true,
      reducedMotion: false,
    });
    expect(S().notices).toEqual([]);
  });

  it('falls back to defaults on corrupt data', () => {
    boot({}, fakeStorage({ [storageKeys.progress]: '{oops', [storageKeys.settings]: '"loud"' }));
    expect(S().progress).toEqual(initialProgress());
    expect(useApp.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('saves settings changes made through useApp', () => {
    boot();
    useApp.getState().setSettings({ volume: 0.25 });
    useApp.getState().setSettings({ reducedMotion: true });
    S().flush();
    expect(JSON.parse(storage.data.get(storageKeys.settings)!)).toEqual({
      volume: 0.25,
      reducedMotion: true,
      lowPerf: false,
    });
  });

  it('warns once when nothing can be saved (memory storage)', () => {
    store = createSessionStore();
    store.getState().init({ persistence: createPersistence(null) });
    expect(S().persistent).toBe(false);
    expect(S().notices.map((n) => n.key)).toEqual(['model.save.unavailable']);
  });
});

describe('design slots and autosave (FLOW-1)', () => {
  it('starts a stage with its start design and autosaves edits to the stage slot', () => {
    boot();
    expect(S().startStage('c1-s1')).toBe(true);
    expect(S().slot).toBe('c1-s1');
    expect(selectStage(S())?.id).toBe('c1-s1');
    expect(editor().design).toEqual(startDesign(c1s1));
    S().flush();
    // 開いただけでは保存しない
    expect(savedDesign('c1-s1')).toBeNull();

    const fixed = c1s1.reference!;
    editor().commit(fixed);
    S().flush();
    expect(savedDesign('c1-s1')).toEqual(fixed);

    // 別のステージは別のスロット。戻ると保存した設計が開く
    S().leaveStage();
    expect(S().slot).toBeNull();
    S().openSandbox();
    expect(S().slot).toBe(SANDBOX_SLOT);
    expect(S().stageId).toBeNull();
    expect(editor().design.links).toEqual([]);
    S().startStage('c1-s1');
    expect(editor().design).toEqual(fixed);
  });

  it('keeps designs across sessions', () => {
    boot();
    S().startStage('c1-s1');
    editor().commit(c1s1.reference!);
    S().dispose();
    boot({}, storage);
    expect(S().slot).toBeNull();
    S().startStage('c1-s1');
    expect(editor().design).toEqual(c1s1.reference!);
  });

  it('refuses locked stages unless forced', () => {
    boot();
    expect(S().startStage(c1s2)).toBe(false);
    expect(S().slot).toBeNull();
    expect(S().startStage('nope')).toBe(false);
    expect(S().startStage(c1s2, { force: true })).toBe(true);
  });

  it('turns save failures into one notice per reason', () => {
    boot();
    S().startStage('c1-s1');
    storage.failWith(quotaError());
    editor().commit(c1s1.reference!);
    S().flush();
    editor().commit({ ...c1s1.reference!, name: 'x' });
    S().flush();
    const n = S().notices.filter((m) => m.kind === 'save');
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ key: 'model.save.quota', severity: 'error' });
    S().dismissNotice(n[0]!.id);
    expect(S().notices).toEqual([]);
  });

  it('resets a design to the stage start and forgets the saved copy', () => {
    boot();
    S().startStage('c1-s1');
    editor().commit(c1s1.reference!);
    S().flush();
    S().resetDesign();
    expect(editor().design).toEqual(startDesign(c1s1));
    S().flush();
    expect(savedDesign('c1-s1')).toBeNull();
  });

  it('exposes stage constraints for the editor', () => {
    boot();
    S().startStage('c1-s1');
    expect(selectLockedJoints(S())).toEqual(c1s1.lockedJoints);
    // チュートリアルの最初は部品を渡していない
    expect(selectAllowedParts(S())).toEqual([]);
    S().skipTutorial();
    expect(selectTutorial(S())).toBeNull();
    expect(selectAllowedParts(S())).toEqual(c1s1.parts);
  });
  it('derived selectors return stable references (safe for useSession(selector))', () => {
    boot();
    S().startStage('c1-s1');
    const sels = [
      selectStage,
      selectTutorial,
      selectAllowedParts,
      selectLockedJoints,
      selectRevealedHints,
      selectHintGhost,
    ] as const;
    const check = () => sels.forEach((sel) => expect(sel(S())).toBe(sel(S())));
    check();
    const parts = selectAllowedParts(S());
    // 設計を変えても部品の組が同じなら同じ配列
    editor().commit({ ...editor().design, name: 'renamed' });
    expect(selectAllowedParts(S())).toBe(parts);
    S().revealHint();
    S().revealHint();
    check();
    S().tutorialClick();
    check();
  });
});

describe('run lifecycle through the session (FLOW-2)', () => {
  it('blocks the broken start design, then clears with the reference and unlocks the next stage', async () => {
    boot();
    S().startStage('c1-s1');
    S().skipTutorial();

    // 壊れた機械(自由度 2)は試走前チェックで止まる
    expect(await S().startRun()).toBeNull();
    expect(S().run.phase).toBe('idle');
    expect(S().preflight?.ok).toBe(false);
    expect(S().preflight?.problems.some((p) => p.severity === 'error')).toBe(true);

    // 直すとチェックの一覧も更新される
    editor().commit(c1s1.reference!);
    expect(S().preflight?.ok).toBe(true);

    const live = await S().startRun();
    expect(live).not.toBeNull();
    const r = S().run;
    expect(r.phase).toBe('running');
    if (r.phase === 'running') expect(r.previousGhost).toBeNull();
    live!.runToEnd();
    const outcome = S().finishRun()!;
    expect(outcome.result.cleared).toBe(true);
    expect(outcome.diagnosis).toBeNull();
    expect(outcome.nextStageId).toBe(c1s2);
    expect(S().run.phase).toBe('finished');
    expect(S().lastOutcome).toBe(outcome);
    expect(isStageUnlocked(S().progress, c1s2)).toBe(true);
    expect(S().notices.map((n) => n.key)).toContain('game.unlock.stage');
    // 進行は保存される
    const saved = createPersistence(storage).loadProgress();
    expect(saved.best['c1-s1']?.cleared).toBe(true);

    // 前回の試走はゴーストとして次の試走に並走する
    expect(selectPreviousGhost(S())).toBe(outcome.ghost);
    const again = await S().startRun();
    const r2 = S().run;
    expect(r2.phase === 'running' && r2.previousGhost === outcome.ghost).toBe(true);
    S().abortRun();
    expect(S().run.phase).toBe('idle');
    expect(again!.done).toBe(false);

    // 次のステージへ
    expect(S().startStage(outcome.nextStageId!)).toBe(true);
    expect(S().slot).toBe(c1s2);
  });

  it('finishRun fast-forwards an unfinished run, and replay does not record again', async () => {
    boot();
    S().startStage('c1-s1');
    S().skipTutorial();
    editor().commit(c1s1.reference!);
    const live = (await S().startRun())!;
    live.advance(0.05);
    const outcome = S().finishRun()!;
    expect(live.done).toBe(true);
    expect(outcome.summary.time).toBeGreaterThan(0.5);
    const best = S().progress.best['c1-s1'];

    const replay = (await S().replayRun(1))!;
    expect(replay.speed).toBe(0.5);
    expect(replay.time).toBeGreaterThan(outcome.summary.time - 1.01);
    const r = S().run;
    expect(r.phase === 'running' && r.replay).toBe(true);
    replay.runToEnd();
    // 決定論:同じ設計を走らせ直すと同じ終わり方になる
    expect(replay.summary()).toEqual(outcome.summary);
    expect(S().finishRun()).toBe(outcome);
    expect(S().run.phase).toBe('finished');
    expect(S().progress.best['c1-s1']).toBe(best);
    S().dismissResult();
    expect(S().run.phase).toBe('idle');
  });

  it('counts failures and suggests a hint after repeated failures', async () => {
    let now = 1000;
    boot({ now: () => now, runOptions: { params: { motor: { stallTorque: 1 } } } });
    S().startStage('c1-s1');
    S().skipTutorial();
    editor().commit(c1s1.reference!);
    for (let k = 0; k < 2; k++) {
      (await S().startRun())!.runToEnd();
      const o = S().finishRun()!;
      expect(o.result.cleared).toBe(false);
      expect(o.diagnosis?.cause).toBe('stalled');
    }
    expect(S().failedRuns['c1-s1']).toBe(2);
    expect(S().hintSuggested).toBe(true);
    expect(S().notices.map((n) => n.key)).toContain('flow.hint.suggest');
    expect(isStageUnlocked(S().progress, c1s2)).toBe(false);

    // ヒントを開くと促しは止まる(次は失敗 4 回か 6 分)
    const h1 = S().revealHint()!;
    expect(h1.level).toBe(1);
    expect(S().hintSuggested).toBe(false);
    expect(selectHintGhost(S())).toBeNull();
    expect(S().revealHint()!.level).toBe(2);
    expect(selectRevealedHints(S())).toHaveLength(2);
    expect(selectHintGhost(S())).not.toBeNull();
    expect(isHintSuggested(S(), now)).toBe(false);
    now += 1000 * 60 * 9;
    expect(isHintSuggested(S(), now)).toBe(true);
    expect(S().revealHint()!.level).toBe(3);
    expect(S().revealHint()).toBeNull();
  });
});

describe('tutorial (FLOW-4)', () => {
  it('advances from clicks, editor changes and the test run', async () => {
    boot();
    S().startStage('c1-s1');
    const steps = c1s1.tutorial!;
    expect(selectTutorial(S())?.textKey).toBe(steps[0]!.key);
    expect(selectTutorial(S())?.waitsForClick).toBe(true);
    S().tutorialClick();
    S().tutorialClick();
    // 部品を渡すステップ:リンクとピンが使えるようになる
    expect(selectTutorial(S())?.index).toBe(2);
    expect(selectAllowedParts(S())).toEqual(['link', 'pin']);
    // 足りないリンクをつなぐと、自由度 1・一回転のステップを飛ばして試走のステップへ
    const d = editor().design;
    editor().commit({ ...d, links: [...d.links, { id: 'l1', joints: ['O4', 'B'] }] });
    const tut = selectTutorial(S())!;
    expect(tut.step.until.kind).toBe('testRun');
    // チュートリアルで渡していない部品(最初からある固定点・クランク)があっても試走できる
    const live = await S().startRun();
    expect(live).not.toBeNull();
    expect(selectTutorial(S())).toBeNull();
    S().abortRun();
  });

  it('does not restart the tutorial of a cleared stage', () => {
    boot(
      {},
      fakeStorage({
        [storageKeys.progress]: JSON.stringify(recordResult(initialProgress(), cleared('c1-s1'))),
      }),
    );
    S().startStage('c1-s1');
    expect(selectTutorial(S())).toBeNull();
  });
});

describe('share boot (FLOW-3)', () => {
  const ref = c1s1.reference!;
  const run = { stageId: 'c1-s1', time: 4.2, energy: 55.5, parts: 10, cost: 520, cleared: true };

  it('loads a shared design with its record and ghost as the opponent', () => {
    const clearShare = vi.fn();
    const ghost = syntheticWalkGhost(3);
    const hash = encodeShare({ design: ref, run, ghost });
    const result = boot({ readShare: () => decodeShare(hash), clearShare });
    expect(result).toEqual({ share: 'loaded', slot: 'c1-s1' });
    expect(clearShare).toHaveBeenCalledTimes(1);
    expect(S().slot).toBe('c1-s1');
    expect(editor().design.links.map((l) => l.id)).toEqual(ref.links.map((l) => l.id));
    expect(selectOpponent(S())).toEqual(run);
    expect(S().opponentGhost?.frames.length).toBe(ghost.frames.length);
    expect(S().notices.map((n) => n.key)).toEqual(['model.share.loaded']);
    // 共有された機械ではチュートリアルを始めない
    expect(selectTutorial(S())).toBeNull();
    // 開いただけでは自分の設計のスロットを上書きしない
    S().flush();
    expect(savedDesign('c1-s1')).toBeNull();
    // 別のステージでは相手を出さない
    S().openSandbox();
    expect(selectOpponent(S())).toBeNull();
  });

  it('races the opponent ghost in the test run', async () => {
    const ghost = syntheticWalkGhost(3);
    boot({ readShare: () => decodeShare(encodeShare({ design: ref, run, ghost })) });
    await S().startRun();
    const r = S().run;
    expect(r.phase === 'running' && r.opponentGhost === S().opponentGhost).toBe(true);
    S().abortRun();
  });

  it('ignores an invalid payload with a notice', () => {
    const clearShare = vi.fn();
    const result = boot({ readShare: () => decodeShare('#s=garbage!!'), clearShare });
    expect(result.share).toBe('invalid');
    expect(clearShare).toHaveBeenCalledTimes(1);
    expect(S().slot).toBeNull();
    expect(S().notices).toHaveLength(1);
    expect(S().notices[0]).toMatchObject({ kind: 'share', severity: 'error' });
  });

  it('shares the design, the record and the ghost from the result screen', async () => {
    const copied: SharePayload[] = [];
    boot({
      copyShare: async (p) => {
        copied.push(p);
        return { url: 'https://example.test/#s=x', copied: true };
      },
    });
    S().startStage('c1-s1');
    S().skipTutorial();
    editor().commit(ref);
    // 設計だけ
    await S().shareCurrent();
    expect(copied[0]).toEqual({ design: ref });
    (await S().startRun())!.runToEnd();
    const outcome = S().finishRun()!;
    const r = await S().shareCurrent();
    expect(r?.copied).toBe(true);
    expect(copied[1]!.run?.stageId).toBe('c1-s1');
    expect(copied[1]!.ghost).toBe(outcome.ghost);
    expect(S().notices.map((n) => n.key)).toContain('model.share.copied');
    // 実際の共有 URL として往復できる
    const back = decodeShare(encodeShare(copied[1]!));
    expect(back.ok && back.payload.run?.cleared).toBe(true);
  });
});

describe('JSON export and import (FLOW-5)', () => {
  it('imports a picked file into the current slot and saves it', async () => {
    const download = vi.fn();
    let pick: SessionDeps['pickDesignFile'] = async () => null;
    boot({ downloadDesign: download, pickDesignFile: () => pick!() });
    S().startStage('c1-s1');
    S().exportDesign();
    expect(download).toHaveBeenCalledWith(editor().design);

    // キャンセル
    expect(await S().importDesign()).toBe(false);
    // 壊れたファイル
    pick = async () => ({ ok: false, reason: 'corrupt', errors: ['x'] });
    expect(await S().importDesign()).toBe(false);
    expect(S().notices.at(-1)).toMatchObject({ kind: 'file', key: 'model.load.corrupt' });
    // 読めたファイル
    const design = { ...c1s1.reference!, name: '読み込んだ脚' };
    pick = async () => ({ ok: true, design, warnings: [], fromVersion: 1 });
    expect(await S().importDesign()).toBe(true);
    expect(editor().design).toEqual(design);
    expect(S().notices.at(-1)).toMatchObject({
      key: 'flow.file.imported',
      params: { name: '読み込んだ脚' },
    });
    S().flush();
    expect(savedDesign('c1-s1')).toEqual(design);
  });

  it('imports into the sandbox when no stage is open', async () => {
    const design = { ...c1s1.reference!, name: 'sb' };
    boot({ pickDesignFile: async () => ({ ok: true, design, warnings: [], fromVersion: 1 }) });
    expect(await S().importDesign()).toBe(true);
    expect(S().slot).toBe(SANDBOX_SLOT);
    S().flush();
    expect(savedDesign(SANDBOX_SLOT)).toEqual(design);
  });
});

describe('progress reset', () => {
  it('clears progress but keeps designs', () => {
    const progress = recordResult(initialProgress(), cleared('c1-s1'));
    boot({}, fakeStorage({ [storageKeys.progress]: JSON.stringify(progress) }));
    S().startStage('c1-s1');
    editor().commit(c1s1.reference!);
    S().resetProgress();
    expect(S().progress).toEqual(initialProgress());
    expect(S().slot).toBeNull();
    expect(createPersistence(storage).loadProgress()).toEqual(initialProgress());
    expect(savedDesign('c1-s1')).toEqual(c1s1.reference!);
    S().markTransitionSeen('T-01');
    expect(createPersistence(storage).loadProgress().seenTransitions).toEqual(['T-01']);
  });
});
