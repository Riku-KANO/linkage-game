import { createStore } from 'zustand/vanilla';
import type { LiveRun, RunEnd } from '@/app/flow';
import type { Ghost } from '@/core/model/ghost';
import type { Vec3, WalkerSim } from '@/core/sim/types';
import { createSimClock, type SimClockOptions, type SimSpeed } from '@/testrun/clock';
import {
  DEFAULT_TOGGLES,
  type FrameListener,
  type RunStatus,
  type TestRunController,
  type TestRunUiState,
  type VisualToggles,
} from '@/testrun/controller';
import {
  createSlowMoState,
  DEFAULT_SLOWMO,
  isSlowMoActive,
  resetSlowMo,
  tiltFromQuat,
  updateSlowMo,
  type FallSignal,
  type SlowMoParams,
} from '@/testrun/slowmo';
import { copySnapshot, createEmptySnapshot, lerpSnapshot } from '@/testrun/snapshot';

/**
 * flow の試走(LiveRun)を testrun の操作盤・3D 部品で動かすための進行役(INT-2)。
 *
 * 時計は 1 つ:testrun の SimClock(固定ステップ・速度・コマ送り・自動スロー・描画の補間)が
 * 「何回進めるか」を決め、ステップそのものは必ず LiveRun.step() で進める。LiveRun が終了の判定・
 * ゴーストの記録・評価の要約を持つので、ここでどう進めても(速度・一時停止・スロー・結果へ)
 * finishRun() の評価はヘッドレスの試走とビット単位で同じになる(S-05)。
 *
 * testrun の TestRunController と同じ形なので、TestRunScene・TestRunHud(ControlBar・トルク計・
 * 設計図の縮小版・表示の切り替え)がそのまま使える。違い:
 *  - 速度:LiveRun.speed は試走の基準の速さ(転倒の再生は 0.5)。操作盤の ×¼〜×4 はそれに掛かる
 *  - リセット(↺・R):同じ機体を巻き戻せないので、onRestart(新しい試走を始める)を呼ぶ
 *  - 状態:終わった理由は LiveRun のもの。停動は走行中だけ一時的に出る(回復したら消える)
 *  - setTimeScale:演出(T-04 のゴールのスローなど)が掛ける追加の倍率
 */

export interface LiveRunControllerOptions {
  /** ↺(リセット)・R キー:新しい試走を始め直す */
  onRestart?: () => void;
  /** 転倒の瞬間の自動スロー(既定 true) */
  autoSlowMo?: boolean;
  slowMo?: Partial<SlowMoParams>;
  clock?: SimClockOptions;
  show?: Partial<VisualToggles>;
  /** 前回の試走のゴースト(previousGhost() で返す) */
  previousGhost?: Ghost | null;
  /** 一時停止で始める */
  startPaused?: boolean;
}

export interface LiveRunController extends TestRunController {
  readonly live: LiveRun;
  /** 演出が掛ける追加の時間の倍率(既定 1。0 で止める) */
  setTimeScale(k: number): void;
  readonly extraTimeScale: number;
  /** LiveRun を外から進めた(結果へ・finishRun)あと、描画のスナップショットを最新に合わせる */
  sync(): void;
  /**
   * 余韻:評価(finishRun)が済んだ後、機体をそのまま少し動かし続ける(見せるだけ)。T-04 のゴールの
   * スローの間も機械が歩き続けるように。LiveRun の機体を直接進めるので、評価の後でだけ呼ぶこと
   * (LiveRun の summary・ゴーストはもう使わない)。MAX_COAST 秒で止まる
   */
  startCoast(): void;
  readonly coasting: boolean;
}

/** 余韻の上限(シミュレーション時間 s) */
export const MAX_COAST = 2.5;

function finiteSnapshot(s: { com: Vec3; body: { position: Vec3 } }): boolean {
  const ok = (v: Vec3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  return ok(s.com) && ok(s.body.position);
}

/** LiveRun の終わった理由 → 操作盤の状態(時間切れは testrun に札がないので running のまま) */
export function statusOfEnd(end: RunEnd | null, stalledNow: boolean): RunStatus {
  switch (end) {
    case 'goal':
      return 'goal';
    case 'fallen':
      return 'fallen';
    case 'jammed':
      return 'jammed';
    case 'stalled':
      return 'stalled';
    case 'timeLimit':
      return 'running';
    default:
      return stalledNow ? 'stalled' : 'running';
  }
}

export function createLiveRunController(
  live: LiveRun,
  options: LiveRunControllerOptions = {},
): LiveRunController {
  const autoSlowMo = options.autoSlowMo ?? true;
  const slowParams: SlowMoParams = { ...DEFAULT_SLOWMO, ...options.slowMo };
  const clock = createSimClock({ dt: live.dt, ...options.clock });
  const previous = options.previousGhost ?? null;

  const store = createStore<TestRunUiState>(() => ({
    paused: options.startPaused ?? live.paused,
    speed: 1,
    follow: true,
    show: { ...DEFAULT_TOGGLES, ...options.show },
    status: statusOfEnd(live.end, live.status().stalled),
    slowMo: false,
    runId: 0,
  }));
  clock.setPaused(store.getState().paused);
  live.paused = store.getState().paused;

  const prev = createEmptySnapshot();
  const curr = createEmptySnapshot();
  const render = createEmptySnapshot();
  const slow = createSlowMoState();
  const signal: FallSignal = { tilt: 0, tiltRate: 0, fallen: false };
  let lastTilt = 0;
  let lastTiltTime = 0;
  let scale = 1;
  let extra = 1;
  let coasting = false;
  let coastAcc = 0;
  let coastTime = 0;
  const listeners = new Set<FrameListener>();
  const origin: Vec3 = { x: 0, y: 0, z: 0 };

  /** 機体は LiveRun のもの。step は LiveRun を通す(終了の判定とゴーストの記録のため) */
  const sim: WalkerSim = {
    params: live.sim.params,
    step: () => void live.step(),
    snapshot: () => live.snapshot(),
    reset: () => options.onRestart?.(),
  };

  const stepFn = () => {
    live.step();
  };

  const baseSpeed = () => (Number.isFinite(live.speed) ? Math.max(0, live.speed) : 1);

  const updateSignal = () => {
    const tilt = tiltFromQuat(curr.body.quaternion);
    const dt = curr.time - lastTiltTime;
    if (dt > 1e-9) {
      signal.tiltRate = (tilt - lastTilt) / dt;
      lastTilt = tilt;
      lastTiltTime = curr.time;
    } else if (dt < 0) {
      signal.tiltRate = 0;
      lastTilt = tilt;
      lastTiltTime = curr.time;
    }
    signal.tilt = tilt;
    signal.fallen = curr.fallen;
  };

  const updateStatus = () => {
    const s = store.getState();
    const status = statusOfEnd(live.end, !live.done && curr.stalled);
    const slowMo = isSlowMoActive(slow);
    if (status !== s.status || slowMo !== s.slowMo) store.setState({ status, slowMo });
  };

  const notify = () => {
    for (const l of listeners) l(render, controller);
  };

  /** 最新の固定ステップに合わせる(補間なし) */
  const snapToLatest = () => {
    copySnapshot(live.snapshot(), curr);
    copySnapshot(curr, prev);
    copySnapshot(curr, render);
  };

  const captureInitial = () => {
    snapToLatest();
    origin.x = live.startX;
    origin.y = curr.com.y;
    origin.z = curr.com.z;
    lastTilt = tiltFromQuat(curr.body.quaternion);
    lastTiltTime = curr.time;
    signal.tilt = lastTilt;
    signal.tiltRate = 0;
    signal.fallen = curr.fallen;
  };

  /** 余韻:機体を直接進める(固定ステップ、1 フレーム 40 まで)。発散したら止める */
  const coast = (realDt: number) => {
    const dt = live.dt;
    const k = clock.paused ? 0 : clock.speed * baseSpeed() * extra;
    const d = Number.isFinite(realDt) ? Math.min(0.1, Math.max(0, realDt)) : 0;
    if (coastTime < MAX_COAST) coastAcc += d * k;
    let n = 0;
    while (coastAcc >= dt - 1e-9 && coastTime < MAX_COAST && n < 40) {
      live.sim.step();
      coastAcc -= dt;
      coastTime += dt;
      n++;
    }
    if (n > 0) {
      const s = live.sim.snapshot();
      if (finiteSnapshot(s)) {
        if (n === 1) copySnapshot(curr, prev);
        copySnapshot(s, curr);
        if (n > 1) copySnapshot(curr, prev);
        updateSignal();
      } else coasting = false;
    }
    if (coastTime >= MAX_COAST || !coasting) copySnapshot(curr, render);
    else lerpSnapshot(prev, curr, Math.min(1, Math.max(0, coastAcc / dt)), render);
    updateStatus();
    notify();
  };

  const controller: LiveRunController = {
    live,
    sim,
    clock,
    store,
    goalX: live.stage.goal.x,
    getSnapshot: () => render,
    getLatest: () => curr,
    getOrigin: () => origin,
    get timeScale() {
      return clock.paused ? 0 : clock.speed * scale * baseSpeed() * extra;
    },
    get extraTimeScale() {
      return extra;
    },
    tick(realDt) {
      if (live.done && coasting) {
        coast(realDt);
        return;
      }
      if (live.done) {
        // 終わった後は最後の姿勢のまま(外で進めた分もここで追いつく)
        if (curr.time !== live.time) {
          snapToLatest();
          updateSignal();
        } else if (render.time !== curr.time) copySnapshot(curr, render);
        updateStatus();
        notify();
        return;
      }
      scale = autoSlowMo ? updateSlowMo(slow, signal, realDt, slowParams) : 1;
      const before = live.time;
      const n = clock.advance(realDt, stepFn, scale * baseSpeed() * extra);
      if (live.time !== before) {
        if (n === 1) {
          copySnapshot(curr, prev);
          copySnapshot(live.snapshot(), curr);
        } else {
          copySnapshot(live.snapshot(), curr);
          copySnapshot(curr, prev);
        }
        updateSignal();
      }
      if (live.done) copySnapshot(curr, render);
      else lerpSnapshot(prev, curr, clock.alpha, render);
      updateStatus();
      notify();
    },
    setPaused(p) {
      clock.setPaused(p);
      live.paused = p;
      if (store.getState().paused !== p) store.setState({ paused: p });
    },
    togglePause() {
      controller.setPaused(!clock.paused);
    },
    setSpeed(speed: SimSpeed) {
      clock.setSpeed(speed);
      store.setState({ speed: clock.speed });
    },
    stepOnce() {
      controller.setPaused(true);
      if (!live.done) clock.stepOnce(stepFn);
      snapToLatest();
      updateSignal();
      updateStatus();
      notify();
    },
    reset() {
      options.onRestart?.();
    },
    setFollow(on) {
      store.setState({ follow: on });
    },
    setShow(patch) {
      store.setState({ show: { ...store.getState().show, ...patch } });
    },
    setTimeScale(k) {
      extra = Number.isFinite(k) ? Math.max(0, k) : 1;
    },
    get coasting() {
      return coasting;
    },
    startCoast() {
      if (!live.done || coasting) return;
      snapToLatest();
      coasting = true;
      coastAcc = 0;
      coastTime = 0;
    },
    sync() {
      if (coasting) return;
      snapToLatest();
      updateSignal();
      updateStatus();
      notify();
    },
    currentGhost: () => live.ghost(),
    previousGhost: () => previous,
    onFrame(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  resetSlowMo(slow);
  captureInitial();
  return controller;
}
