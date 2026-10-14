// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore, type SessionDeps } from '@/app/flow';
import { useApp } from '@/app/store';
import { jansenLeg } from '@/core/model/presets';
import { createFlatTerrain } from '@/core/sim';
import { createMemoryStorage, createPersistence, SANDBOX_SLOT } from '@/core/storage/persistence';
import { useEditor } from '@/editor/store';
import { getStage, isStageUnlocked, nextStageId, sameLegLayout, stageLegs } from '@/game';
import { resolveStation } from '@/scene/rig/stations';
import { useSceneUi } from '@/scene/store';
import {
  backToDesign,
  beginTestRun,
  finishToResult,
  goNextStage,
  replayFall,
  type SessionStore,
} from './actions';
import { installRunBridge } from './bridge';
import { createFollowRig } from './camera';
import { END_PAUSE, runFrame } from './frame';
import { followRig, getRunView, run3dSignals, runViewStore, setRunView } from './runView';

const c1s1 = getStage('c1-s1')!;
const flat = createFlatTerrain(0);

let store: SessionStore;
let uninstall: () => void = () => {};

function deps(over: SessionDeps = {}): SessionDeps {
  return {
    persistence: createPersistence(createMemoryStorage()),
    readShare: () => ({ ok: false, reason: 'empty', errors: [] }),
    clearShare: () => {},
    onPageHide: () => () => {},
    createTerrain: () => Promise.resolve(flat),
    ...over,
  };
}

function boot(over: SessionDeps = {}) {
  store = createSessionStore();
  store.getState().init(deps(over));
  uninstall = installRunBridge(store);
}

/** 遷移を終えたことにする(カメラが着いた) */
function arrive() {
  const app = useApp.getState();
  if (app.transition) app.finishTransition();
  useSceneUi.getState().setRevealed(useApp.getState().screen);
}

/** 試走を最後まで進めて結果へ(描画ループの代わり) */
function playToEnd() {
  const view = getRunView()!;
  let now = 0;
  for (let k = 0; k < 100000 && !view.handedOver; k++) {
    now += 1000 / 60;
    const r = runFrame(
      view,
      1 / 60,
      {
        screen: useApp.getState().screen,
        revealed: useSceneUi.getState().revealed,
        hold: false,
        nowMs: now,
      },
      { follow: followRig, anchor: [0, 0, 0] },
    );
    if (r.finish) finishToResult(store);
  }
}

beforeEach(() => {
  useApp.setState({ screen: 'design', transition: null, history: ['home'], stageId: null });
  useSceneUi.getState().setRevealed('design');
  useEditor.getState().replaceDesign(jansenLeg());
  setRunView(null);
});
afterEach(() => {
  uninstall();
  store.getState().dispose();
  run3dSignals.hold = false;
});

describe('beginTestRun (the design screen’s test-run button)', () => {
  it('stays on the design screen and opens the problems when the preflight fails', async () => {
    boot();
    store.getState().startStage('c1-s1');
    expect(await beginTestRun(store)).toBe(false);
    expect(useApp.getState().screen).toBe('design');
    expect(store.getState().preflight?.ok).toBe(false);
    expect(runViewStore.getState().preflightOpen).toBe(true);
    expect(getRunView()).toBeNull();
    // 直せば閉じる
    useEditor.getState().replaceDesign(c1s1.reference!);
    expect(store.getState().preflight?.ok).toBe(true);
    expect(runViewStore.getState().preflightOpen).toBe(false);
  });

  it('flies to the test run, puts the live machine on the track and hides the placeholder', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    const p = beginTestRun(store);
    expect(useApp.getState().screen).toBe('testRun');
    expect(useApp.getState().transition?.id).toBe('T-03');
    expect(await p).toBe(true);
    const view = getRunView()!;
    const run = store.getState().run;
    expect(run.phase === 'running' && run.live === view.live).toBe(true);
    expect(useSceneUi.getState().trackBusy).toBe(true);
    expect(runViewStore.getState().preflightOpen).toBe(false);
  });

  it('a free design (no stage open) runs in the sandbox with the standard leg array', async () => {
    boot();
    expect(store.getState().slot).toBeNull();
    expect(await beginTestRun(store)).toBe(true);
    expect(store.getState().slot).toBe(SANDBOX_SLOT);
    const live = getRunView()!.live;
    expect(sameLegLayout(live.design.legs, stageLegs(live.stage))).toBe(true);
  });
});

describe('test run → result → design (INT-2 / INT-3)', () => {
  it('holds the run until the camera arrives, then plays it and hands over to the result', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    await beginTestRun(store);
    const view = getRunView()!;
    // 遷移中は進めない
    runFrame(
      view,
      1 / 60,
      { screen: 'testRun', revealed: null, hold: false, nowMs: 0 },
      { follow: createFollowRig(), anchor: [0, 0, 0] },
    );
    expect(view.live.time).toBe(0);
    arrive();
    playToEnd();
    expect(useApp.getState().screen).toBe('result');
    const run = store.getState().run;
    expect(run.phase).toBe('finished');
    if (run.phase !== 'finished') return;
    expect(run.outcome.result.cleared).toBe(true);
    expect(run.outcome.nextStageId).toBe(nextStageId('c1-s1'));
    // 結果画面でも機械はコースの上(最後の姿勢)
    expect(getRunView()).toBe(view);
    expect(view.controller.getSnapshot().time).toBe(view.live.time);
    expect(isStageUnlocked(store.getState().progress, nextStageId('c1-s1')!)).toBe(true);
  });

  it('結果へ finishes the run at once with the same evaluation', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    await beginTestRun(store);
    arrive();
    expect(finishToResult(store)).toBe(true);
    expect(useApp.getState().screen).toBe('result');
    const view = getRunView()!;
    expect(view.live.done).toBe(true);
    expect(view.controller.store.getState().status).toBe('goal');
  });

  it('設計に戻る from the result dismisses it and clears the track once the camera is back', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    await beginTestRun(store);
    arrive();
    finishToResult(store);
    arrive();
    backToDesign(store);
    expect(store.getState().run.phase).toBe('idle');
    expect(useApp.getState().screen).toBe('design');
    expect(useApp.getState().transition?.id).toBe('T-05');
    // 「戻る」は結果・試走へ逆戻りせず、試走の前にいた画面へ
    expect(useApp.getState().history).toEqual(['home']);
    // 戻る途中はまだコースにいる
    expect(getRunView()).not.toBeNull();
    arrive();
    expect(getRunView()).toBeNull();
    expect(useSceneUi.getState().trackBusy).toBe(false);
  });

  it('leaving the test run (Esc) aborts it and goes to the design screen', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    await beginTestRun(store);
    arrive();
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(store.getState().run.phase).toBe('idle');
    expect(useApp.getState().screen).toBe('design');
  });

  it('going to the test run screen directly starts a run (and bounces back on a failed check)', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useApp.getState().go('testRun');
    await Promise.resolve();
    expect(useApp.getState().screen).toBe('design');
    expect(runViewStore.getState().preflightOpen).toBe(true);

    useEditor.getState().replaceDesign(c1s1.reference!);
    useApp.getState().go('testRun');
    await vi.waitFor(() => expect(getRunView()).not.toBeNull());
    expect(store.getState().run.phase).toBe('running');
  });

  it('↺ (controller reset) starts a new run on the same screen', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    await beginTestRun(store);
    const first = getRunView()!;
    first.controller.reset();
    await vi.waitFor(() => expect(getRunView()).not.toBe(first));
    expect(getRunView()!.live).not.toBe(first.live);
    expect(useApp.getState().screen).toBe('testRun');
  });

  it('もう一度 from the result runs again with the previous run as a ghost', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    await beginTestRun(store);
    arrive();
    finishToResult(store);
    arrive();
    const first = getRunView()!;
    first.controller.reset();
    await vi.waitFor(() => expect(getRunView()).not.toBe(first));
    expect(useApp.getState().screen).toBe('testRun');
    expect(getRunView()!.previousGhost).not.toBeNull();
    expect(getRunView()!.previousDesign).not.toBeNull();
  });

  it('次のステージ goes to the stage select with the next stage chosen (T-06)', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    await beginTestRun(store);
    arrive();
    finishToResult(store);
    arrive();
    const next = nextStageId('c1-s1')!;
    goNextStage(next, store);
    expect(useApp.getState().screen).toBe('stageSelect');
    expect(useApp.getState().transition?.id).toBe('T-06');
    expect(useApp.getState().stageId).toBe(next);
    expect(useApp.getState().history).toEqual(['home']);
    expect(store.getState().run.phase).toBe('idle');
  });

  it('転倒の瞬間を見る replays the end at ×0.5 in the test run view, then returns to the result', async () => {
    boot();
    // 章 2-2 の最初の設計(脚が 1 本で倒れる)
    store.getState().startStage('c2-s2', { force: true });
    await beginTestRun(store);
    arrive();
    playToEnd();
    expect(useApp.getState().screen).toBe('result');
    const done = store.getState().run;
    expect(done.phase === 'finished' && done.outcome.summary.fallen).toBe(true);
    arrive();
    const p = replayFall(store);
    expect(useApp.getState().screen).toBe('testRun');
    expect(await p).toBe(true);
    const view = getRunView()!;
    expect(view.replay).toBe(true);
    expect(view.live.speed).toBe(0.5);
    arrive();
    playToEnd();
    expect(useApp.getState().screen).toBe('result');
    expect(store.getState().run.phase).toBe('finished');
  });
});

describe('camera stations', () => {
  it('the test run follows the machine; the result keeps it clear of the docked panel', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    await beginTestRun(store);
    arrive();
    const view = getRunView()!;
    const anchor: [number, number, number] = [0, 0, 0];
    runFrame(
      view,
      1 / 60,
      { screen: 'testRun', revealed: 'testRun', hold: false, nowMs: 0 },
      { follow: followRig, anchor },
    );
    const ctx = { width: 1280, height: 720, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
    const pose = resolveStation('testRun', ctx);
    expect(pose.target[0]).toBeCloseTo(followRig.target[0], 9);
    // 機械はコースのスタート付近(工房の座標)
    expect(anchor[0]).toBeGreaterThan(-8.5);
    expect(anchor[0]).toBeLessThan(-7);
    expect(anchor[2]).toBeCloseTo(-14, 1);
    // 結果:定位置より右(カメラの右方向)にずれる
    setRunView(null);
    const plain = resolveStation('result', ctx);
    setRunView(view);
    const docked = resolveStation('result', ctx);
    expect(docked.target).not.toEqual(plain.target);
  });

  it('hums the motor only while the run is moving', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    await beginTestRun(store);
    const view = getRunView()!;
    const hum = vi.fn();
    const env = { screen: 'testRun' as const, revealed: 'testRun' as const, hold: false, nowMs: 0 };
    for (let k = 0; k < 30; k++) runFrame(view, 1 / 60, env, { follow: followRig, hum });
    expect(hum.mock.calls.at(-1)![0]).toBeGreaterThan(1);
    runFrame(view, 1 / 60, { ...env, hold: true }, { follow: followRig, hum });
    expect(hum.mock.calls.at(-1)).toEqual([0, 0]);
  });

  it('waits END_PAUSE after the end before handing over', async () => {
    boot();
    store.getState().startStage('c1-s1');
    useEditor.getState().replaceDesign(c1s1.reference!);
    await beginTestRun(store);
    const view = getRunView()!;
    view.live.runToEnd();
    const env = { screen: 'testRun' as const, revealed: 'testRun' as const, hold: false, nowMs: 0 };
    expect(runFrame(view, 1 / 60, env, { follow: followRig }).finish).toBe(false);
    expect(
      runFrame(view, 1 / 60, { ...env, nowMs: END_PAUSE * 1000 - 1 }, { follow: followRig }).finish,
    ).toBe(false);
    expect(
      runFrame(view, 1 / 60, { ...env, nowMs: END_PAUSE * 1000 }, { follow: followRig }).finish,
    ).toBe(true);
  });
});
