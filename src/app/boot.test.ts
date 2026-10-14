import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSfx, type SfxName } from '@/audio/sfx';
import { encodeShare, decodeShare } from '@/core/model/share';
import { createEmptyDesign } from '@/core/model/types';
import {
  createMemoryStorage,
  createPersistence,
  SANDBOX_SLOT,
  storageKeys,
  type StorageLike,
} from '@/core/storage/persistence';
import { useEditor } from '@/editor/store';
import { getStage, initialProgress, recordResult, type RunResult } from '@/game';
import { activateMenu } from '@/scene/home/menu';
import { continueGame, currentContinueTarget, importDesignFile, resetProgress } from './actions';
import { bootApp, disposeApp, type BootOptions } from './boot';
import { useSession, type SessionDeps } from './flow';
import { loadPrefs, PREFS_KEY } from './prefs';
import { resetSettingsSync, setUserSettings } from './settings';
import { useApp, type AppState } from './store';
import { designToJSONText } from '@/core/model/file';

const APP_INITIAL = useApp.getInitialState();
let storage: StorageLike;
let sounds: SfxName[];
const muted: boolean[] = [];

function boot(session: SessionDeps = {}, extra: Partial<BootOptions> = {}) {
  return bootApp({
    session: {
      persistence: createPersistence(storage),
      autosaveMs: 5,
      settingsSaveMs: 5,
      ...session,
    },
    settings: {
      storage,
      osReducedMotion: () => false,
      perfDecision: () => null,
      setMuted: (m) => muted.push(m),
    },
    markDocument: false,
    ...extra,
  });
}

const app = () => useApp.getState();
const S = () => useSession.getState();
/** カメラの遷移が終わった(シーンが呼ぶ) */
const settle = () => app().finishTransition();

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

beforeEach(() => {
  storage = createMemoryStorage();
  sounds = [];
  muted.length = 0;
  registerSfx((name) => sounds.push(name));
  useApp.setState({ ...APP_INITIAL, seenTransitions: new Set(), history: [] } as AppState, true);
  useEditor.getState().replaceDesign(createEmptyDesign());
});

afterEach(() => {
  disposeApp();
  resetSettingsSync();
  S().dispose();
  useSession.setState(useSession.getInitialState(), true);
  registerSfx(() => {});
});

describe('bootApp', () => {
  it('is idempotent and returns the session boot result', () => {
    const init = vi.spyOn(S(), 'init');
    const a = boot();
    const b = bootApp();
    expect(b).toBe(a);
    expect(a).toEqual({ share: 'none', slot: null });
    expect(init).toHaveBeenCalledTimes(1);
    expect(S().ready).toBe(true);
  });

  it('also works when another stream already called init()', () => {
    const first = S().init({ persistence: createPersistence(storage) });
    expect(boot()).toBe(first);
  });
});

describe('seen transitions (design principle 5)', () => {
  it('seeds the in-memory set from saved progress so second runs are short after reload', () => {
    const progress = { ...initialProgress(), seenTransitions: ['T-00', 'T-01'] };
    storage.setItem(storageKeys.progress, JSON.stringify(progress));
    boot();
    expect([...app().seenTransitions].sort()).toEqual(['T-00', 'T-01']);
    app().go('home');
    app().go('stageSelect');
    expect(app().transition).toMatchObject({ id: 'T-01', short: true });
  });

  it('records newly seen transitions into the saved progress', () => {
    boot();
    app().go('home');
    app().go('settings');
    expect(S().progress.seenTransitions).toEqual(['T-00', 'T-08']);
    expect(createPersistence(storage).loadProgress().seenTransitions).toEqual(['T-00', 'T-08']);
  });

  it('forgets them again when the progress is reset', () => {
    boot();
    app().go('home');
    resetProgress();
    expect(S().progress.seenTransitions).toEqual([]);
    expect(app().seenTransitions.size).toBe(0);
  });
});

describe('home menu, continue and stage select (INT-4, INT-5)', () => {
  it('continue opens the first stage on a fresh profile (T-07) through the 3D menu handler', () => {
    boot();
    app().go('home');
    settle();
    activateMenu('continue');
    expect(app().screen).toBe('design');
    expect(app().stageId).toBe('c1-s1');
    expect(app().transition?.id).toBe('T-07');
    expect(S().slot).toBe('c1-s1');
    expect(sounds).toContain('press');
    expect(loadPrefs(storage).lastSlot).toBe('c1-s1');
  });

  it('continue reopens the last played slot after a reload', () => {
    storage.setItem(PREFS_KEY, JSON.stringify({ version: 1, lastSlot: SANDBOX_SLOT }));
    boot();
    expect(currentContinueTarget()).toEqual({ kind: 'sandbox' });
    app().go('home');
    expect(continueGame()).toBe(true);
    expect(S().slot).toBe(SANDBOX_SLOT);
    expect(app().screen).toBe('design');
  });

  it('closes the stage (and saves it) when going back home from the design screen', () => {
    boot();
    app().go('home');
    app().go('stageSelect');
    expect(S().startStage('c1-s2')).toBe(false); // 未解放
    S().startStage('c1-s1');
    app().go('design', { stageId: 'c1-s1' });
    app().back();
    expect(app().screen).toBe('stageSelect');
    expect(S().slot).toBeNull();
    app().back();
    expect(app().screen).toBe('home');
  });

  it('sandbox (window) opens the free design slot directly', () => {
    boot();
    app().go('home');
    activateMenu('sandbox');
    expect(S().slot).toBe(SANDBOX_SLOT);
    expect(app().screen).toBe('design');
    expect(app().stageId).toBeNull();
  });

  it('zukan and settings fly to their panels (T-08)', () => {
    boot();
    app().go('home');
    activateMenu('zukan');
    expect(app().screen).toBe('zukan');
    expect(app().transition?.id).toBe('T-08');
  });
});

describe('share link boot', () => {
  it('flies to the design screen after the boot logo, with home in the history', () => {
    const design = { ...getStage('c1-s1')!.reference!, name: '友だちの脚' };
    const readShare = () => decodeShare(encodeShare({ design }));
    const r = boot({ readShare, clearShare: () => {} });
    expect(r).toEqual({ share: 'loaded', slot: SANDBOX_SLOT });
    expect(app().screen).toBe('boot');
    app().go('home'); // T-00(ロゴが組み上がった)
    expect(app().screen).toBe('home');
    settle(); // カメラが引き終えた
    expect(app().screen).toBe('design');
    expect(app().history).toEqual(['home']);
    expect(S().slot).toBe(SANDBOX_SLOT);
    expect(useEditor.getState().design.name).toBe('友だちの脚');
    expect(S().notices.map((n) => n.key)).toContain('model.share.loaded');
  });

  it('does not hijack the player if they already moved elsewhere', () => {
    const design = createEmptyDesign();
    boot({ readShare: () => decodeShare(encodeShare({ design })), clearShare: () => {} });
    app().go('home');
    app().go('settings');
    settle();
    expect(app().screen).toBe('settings');
  });
});

describe('settings (INT-5)', () => {
  it('ignores stale automatic values stored by flow and uses the auto decision', () => {
    storage.setItem(
      storageKeys.settings,
      JSON.stringify({ volume: 0.4, reducedMotion: true, lowPerf: true }),
    );
    boot();
    expect(app().settings).toMatchObject({
      volume: 0.4,
      reducedMotion: false,
      lowPerf: false,
      muted: false,
      sources: { reducedMotion: 'auto', lowPerf: 'auto' },
    });
  });

  it('saves explicit choices and keeps them against later automatic writes', () => {
    boot();
    setUserSettings({ reducedMotion: true, lowPerf: false, muted: true, volume: 0.3 });
    expect(app().settings).toMatchObject({
      reducedMotion: true,
      lowPerf: false,
      muted: true,
      volume: 0.3,
      sources: { reducedMotion: 'user', lowPerf: 'user' },
    });
    expect(muted.at(-1)).toBe(true);
    expect(loadPrefs(storage)).toMatchObject({ reducedMotion: true, lowPerf: false, muted: true });
    // GPU の測定(PerfProbe)と OS の追従が書き換えても戻す
    app().setSettings({ lowPerf: true });
    app().setSettings({ reducedMotion: false });
    expect(app().settings).toMatchObject({ lowPerf: false, reducedMotion: true });
  });

  it('restores explicit choices after a reload', () => {
    boot();
    setUserSettings({ reducedMotion: true, muted: true });
    disposeApp();
    resetSettingsSync();
    S().dispose();
    useApp.setState({ settings: { ...APP_INITIAL.settings } });
    muted.length = 0;
    boot();
    expect(app().settings).toMatchObject({ reducedMotion: true, muted: true });
    expect(muted).toEqual([true]);
  });
});

describe('design file import from settings', () => {
  it('imports into the sandbox and moves to the design screen with home in the history', async () => {
    boot();
    app().go('home');
    app().go('settings');
    const design = { ...getStage('c1-s1')!.reference!, name: '読み込んだ機械' };
    const ok = await importDesignFile(new Blob([designToJSONText(design)]));
    expect(ok).toBe(true);
    expect(S().slot).toBe(SANDBOX_SLOT);
    expect(app().screen).toBe('design');
    expect(app().history).toEqual(['home']);
  });

  it('stays on settings when the file is broken', async () => {
    boot();
    app().go('home');
    app().go('settings');
    expect(await importDesignFile(new Blob(['nope']))).toBe(false);
    expect(app().screen).toBe('settings');
  });
});

describe('progress reset', () => {
  it('keeps the continue target sensible when the last stage gets locked again', () => {
    let p = recordResult(initialProgress(), cleared('c1-s1'));
    p = recordResult(p, cleared('c1-s2'));
    storage.setItem(storageKeys.progress, JSON.stringify(p));
    storage.setItem(PREFS_KEY, JSON.stringify({ version: 1, lastSlot: 'c1-s3' }));
    boot();
    expect(currentContinueTarget()).toEqual({ kind: 'stage', stageId: 'c1-s3' });
    resetProgress();
    expect(currentContinueTarget()).toEqual({ kind: 'stage', stageId: 'c1-s1' });
  });
});
