import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  createGhostRecorder,
  GHOST_DEFAULT_HZ,
  type Ghost,
  type GhostRecorder,
} from '@/core/model/ghost';
import type { SimSnapshot, Vec3, WalkerSim } from '@/core/sim/types';
import { createSimClock, type SimClock, type SimClockOptions, type SimSpeed } from './clock';
import {
  createSlowMoState,
  DEFAULT_SLOWMO,
  isSlowMoActive,
  resetSlowMo,
  tiltFromQuat,
  updateSlowMo,
  type FallSignal,
  type SlowMoParams,
} from './slowmo';
import { copySnapshot, createEmptySnapshot, lerpSnapshot } from './snapshot';

/**
 * 試走の進行役(TR-3 の自動スロー、TR-4 の時間操作、TR-6 のゴースト記録をまとめる)。
 *
 * React の外に置く普通のオブジェクト。3D 側は <TestRunScene> が毎フレーム tick() を呼び、
 * 描画部品は getSnapshot() を useFrame の中で読む(React の state は使わない)。
 * DOM の操作盤は store(zustand、変化したときだけ更新)と onFrame(毎フレームの数値)を使う。
 *
 * 描画のスナップショットは、直前 2 つの固定ステップの間を時計の alpha で補間したもの
 * (スロー再生でもカクつかない)。1 フレームに 2 ステップ以上進んだときは最新をそのまま使う。
 */

export interface VisualToggles {
  /** 脚先の軌跡 */
  trails: boolean;
  /** 接地点 */
  contacts: boolean;
  /** 重心の投影と支持多角形 */
  com: boolean;
  /** クランクトルクのメーター */
  torque: boolean;
  /** ゴースト */
  ghost: boolean;
  /** 設計図の縮小版 */
  design: boolean;
}

export const DEFAULT_TOGGLES: VisualToggles = {
  trails: true,
  contacts: true,
  com: true,
  torque: true,
  ghost: true,
  design: true,
};

export type RunStatus = 'running' | 'goal' | 'fallen' | 'stalled' | 'jammed';

export interface TestRunUiState {
  paused: boolean;
  speed: SimSpeed;
  /** 追従カメラ */
  follow: boolean;
  show: VisualToggles;
  /** 最初に起きた終了の出来事(ゴール・転倒など)。リセットで running に戻る */
  status: RunStatus;
  /** 自動スロー中 */
  slowMo: boolean;
  /** リセットのたびに 1 増える(前回のゴーストを取り直す合図) */
  runId: number;
}

export interface TestRunControllerOptions {
  sim: WalkerSim;
  /** ゴール:重心の x がこれ以上で到達。null・省略で判定しない */
  goalX?: number | null;
  /** 転倒の瞬間の自動スロー(既定 true) */
  autoSlowMo?: boolean;
  slowMo?: Partial<SlowMoParams>;
  clock?: SimClockOptions;
  /** ゴーストの記録頻度(Hz)。0 で記録しない。既定 10 */
  ghostHz?: number;
  show?: Partial<VisualToggles>;
  /** 一時停止で始める */
  startPaused?: boolean;
}

export type FrameListener = (snapshot: SimSnapshot, controller: TestRunController) => void;

export interface TestRunController {
  readonly sim: WalkerSim;
  readonly clock: SimClock;
  readonly store: StoreApi<TestRunUiState>;
  readonly goalX: number | null;
  /** 描画用(補間済み)のスナップショット。同じオブジェクトを書き換える */
  getSnapshot(): SimSnapshot;
  /** 最新の固定ステップ時点のスナップショット(補間なし) */
  getLatest(): SimSnapshot;
  /** リセット時の重心(進んだ距離の基準) */
  getOrigin(): Vec3;
  /** 今の時間の倍率(速度 × 自動スロー。一時停止中は 0) */
  readonly timeScale: number;
  /** 描画ループから毎フレーム呼ぶ(realDt は実時間の秒) */
  tick(realDt: number): void;
  setPaused(paused: boolean): void;
  togglePause(): void;
  setSpeed(speed: SimSpeed): void;
  /** コマ送り(一時停止にしてから 1 ステップ) */
  stepOnce(): void;
  /** 最初からやり直す。今の記録は previousGhost() に移る */
  reset(): void;
  setFollow(on: boolean): void;
  setShow(patch: Partial<VisualToggles>): void;
  /** 今の試走の記録 */
  currentGhost(): Ghost | null;
  /** 直前の試走(リセット前)の記録 */
  previousGhost(): Ghost | null;
  /** 毎フレーム(と操作の直後)に呼ばれる。解除関数を返す */
  onFrame(listener: FrameListener): () => void;
}

export function createTestRunController(options: TestRunControllerOptions): TestRunController {
  const { sim } = options;
  const goalX = options.goalX ?? null;
  const autoSlowMo = options.autoSlowMo ?? true;
  const slowParams: SlowMoParams = { ...DEFAULT_SLOWMO, ...options.slowMo };
  const clock = createSimClock({ dt: sim.params.dt, ...options.clock });
  const ghostHz = options.ghostHz ?? GHOST_DEFAULT_HZ;
  const recorder: GhostRecorder | null = ghostHz > 0 ? createGhostRecorder(ghostHz) : null;
  let previous: Ghost | null = null;
  let ghostFrame = 0;
  let stepIndex = 0;

  const store = createStore<TestRunUiState>(() => ({
    paused: options.startPaused ?? false,
    speed: 1,
    follow: true,
    show: { ...DEFAULT_TOGGLES, ...options.show },
    status: 'running',
    slowMo: false,
    runId: 0,
  }));
  clock.setPaused(store.getState().paused);

  const prev = createEmptySnapshot();
  const curr = createEmptySnapshot();
  const render = createEmptySnapshot();
  const slow = createSlowMoState();
  const signal: FallSignal = { tilt: 0, tiltRate: 0, fallen: false };
  let lastTilt = 0;
  let lastTiltTime = 0;
  let scale = 1;
  const listeners = new Set<FrameListener>();
  const origin: Vec3 = { x: 0, y: 0, z: 0 };

  const recordGhost = () => {
    if (!recorder) return;
    if (stepIndex * clock.dt + 1e-9 >= ghostFrame / ghostHz) {
      recorder.record(sim.snapshot());
      ghostFrame++;
    }
  };

  const stepFn = () => {
    sim.step();
    stepIndex++;
    recordGhost();
  };

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
    let status = s.status;
    if (status === 'running') {
      if (curr.jammed) status = 'jammed';
      else if (curr.stalled) status = 'stalled';
      else if (curr.fallen) status = 'fallen';
      else if (goalX !== null && curr.com.x >= goalX) status = 'goal';
    }
    const slowMo = isSlowMoActive(slow);
    if (status !== s.status || slowMo !== s.slowMo) store.setState({ status, slowMo });
  };

  const notify = () => {
    for (const l of listeners) l(render, controller);
  };

  const captureInitial = () => {
    copySnapshot(sim.snapshot(), curr);
    copySnapshot(curr, prev);
    copySnapshot(curr, render);
    origin.x = curr.com.x;
    origin.y = curr.com.y;
    origin.z = curr.com.z;
    lastTilt = tiltFromQuat(curr.body.quaternion);
    lastTiltTime = curr.time;
    signal.tilt = lastTilt;
    signal.tiltRate = 0;
    signal.fallen = curr.fallen;
  };

  const controller: TestRunController = {
    sim,
    clock,
    store,
    goalX,
    getSnapshot: () => render,
    getLatest: () => curr,
    getOrigin: () => origin,
    get timeScale() {
      return clock.paused ? 0 : clock.speed * scale;
    },
    tick(realDt) {
      scale = autoSlowMo ? updateSlowMo(slow, signal, realDt, slowParams) : 1;
      const n = clock.advance(realDt, stepFn, scale);
      if (n === 1) {
        copySnapshot(curr, prev);
        copySnapshot(sim.snapshot(), curr);
      } else if (n >= 2) {
        copySnapshot(sim.snapshot(), curr);
        copySnapshot(curr, prev);
      }
      if (n > 0) updateSignal();
      lerpSnapshot(prev, curr, clock.alpha, render);
      updateStatus();
      notify();
    },
    setPaused(p) {
      clock.setPaused(p);
      store.setState({ paused: p });
    },
    togglePause() {
      controller.setPaused(!clock.paused);
    },
    setSpeed(speed) {
      clock.setSpeed(speed);
      store.setState({ speed: clock.speed });
    },
    stepOnce() {
      controller.setPaused(true);
      clock.stepOnce(stepFn);
      copySnapshot(sim.snapshot(), curr);
      copySnapshot(curr, prev);
      copySnapshot(curr, render);
      updateSignal();
      updateStatus();
      notify();
    },
    reset() {
      if (recorder) {
        const g = recorder.ghost();
        if (g.frames.length > 0) previous = g;
        recorder.reset();
      }
      sim.reset();
      clock.reset();
      resetSlowMo(slow);
      scale = 1;
      stepIndex = 0;
      ghostFrame = 0;
      recordGhost();
      captureInitial();
      store.setState({ status: 'running', slowMo: false, runId: store.getState().runId + 1 });
      notify();
    },
    setFollow(on) {
      store.setState({ follow: on });
    },
    setShow(patch) {
      store.setState({ show: { ...store.getState().show, ...patch } });
    },
    currentGhost: () => (recorder ? recorder.ghost() : null),
    previousGhost: () => previous,
    onFrame(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  recordGhost();
  captureInitial();
  return controller;
}
