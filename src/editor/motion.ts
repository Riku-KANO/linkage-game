import type { CompiledMechanism, CycleSample, SolveResult } from '@/core/kinematics';
import { extrapolatePose, solvePose } from '@/core/kinematics';
import { EASINGS } from '@/ui/tokens';

/**
 * 編集中も機構を動かすエンジン(ED-3)。
 *
 * React の外でモーター角 θ を進め、毎フレーム姿勢を解いて購読者に知らせる。
 * 描画側は購読して SVG の属性を直接書き換える(再レンダーしない)。
 * 再生・停止の状態変化だけは subscribeState で React に知らせる。
 */

export type FrameListener = (engine: MotionEngine) => void;

interface Trial {
  t0: number | null;
  from: number;
  delta: number;
  duration: number;
}

const TAU = Math.PI * 2;
/** 前フレームの姿勢を初期値に使える角度の飛び(rad)。これより大きければサンプルから始める */
const MAX_CONTINUOUS_STEP = (10 * Math.PI) / 180;

/** rpm → rad/s */
export const rpmToRadPerSec = (rpm: number) => (rpm * TAU) / 60;

/** 角度を [0, 2π) に */
export const wrapAngle = (a: number) => ((a % TAU) + TAU) % TAU;

/** 1 回転のサンプルのうち角度 theta に最も近いもの(sampleCycle は 0 から +方向に等間隔) */
export function nearestSample(cycle: CycleSample, theta: number): number {
  if (cycle.steps <= 0) return -1;
  const k = Math.round((wrapAngle(theta) / TAU) * cycle.steps);
  return k % cycle.steps;
}

export class MotionEngine {
  /** モーター角(rad)。連続値(折り返さない) */
  theta = 0;
  /** 描画の上限 fps */
  maxFps = 60;

  private playing = true;
  private rpm = 0;
  private mech: CompiledMechanism | null = null;
  private cycle: CycleSample | null = null;
  private bufs: [Float64Array, Float64Array] = [new Float64Array(0), new Float64Array(0)];
  private which = 0;
  private current: SolveResult | null = null;
  private solvedTheta = 0;
  /** 前回の解の角度の刻み(連続して解いたときだけ。0 なら予測しない) */
  private lastStep = 0;
  /** 前の 2 姿勢から外挿した予測位置の作業用(変位点を速度を保って越えるため、KIN-7) */
  private pred = new Float64Array(0);
  private trial: Trial | null = null;
  private frameListeners = new Set<FrameListener>();
  private stateListeners = new Set<() => void>();
  private lastTime: number | null = null;
  private lastDraw = -Infinity;
  private raf = 0;
  private running = false;
  private rafImpl: ((cb: (t: number) => void) => number) | null = null;
  private cafImpl: ((id: number) => void) | null = null;
  private stateVersion = 0;

  get pose(): SolveResult | null {
    return this.current;
  }

  get mechanism(): CompiledMechanism | null {
    return this.mech;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  isTrialRunning(): boolean {
    return this.trial !== null;
  }

  /** useSyncExternalStore 用:状態が変わるたびに増える */
  getStateVersion = (): number => this.stateVersion;

  /** 設計が変わったとき:機構と 1 回転のサンプルを差し替えて今の角度で解き直す */
  setMechanism(mech: CompiledMechanism | null, cycle: CycleSample | null, rpm: number): void {
    this.mech = mech;
    this.cycle = cycle;
    this.rpm = rpm;
    if (mech) {
      const n = mech.jointIds.length * 2;
      if (this.bufs[0].length !== n) this.bufs = [new Float64Array(n), new Float64Array(n)];
    }
    this.solve(true);
    this.emitFrame();
    this.ensureLoop();
  }

  setRpm(rpm: number): void {
    this.rpm = rpm;
  }

  /** 手でクランク角を決める(呼ぶ側で再生を止める) */
  setTheta(theta: number): void {
    this.theta = theta;
    this.solve(false);
    this.emitFrame();
  }

  setPlaying(playing: boolean): void {
    if (playing === this.playing) return;
    this.playing = playing;
    this.lastTime = null;
    this.emitState();
    this.ensureLoop();
  }

  toggle(): void {
    this.setPlaying(!this.playing);
  }

  /** 試しに 1 回転だけ動かす(自由度が 1 になった瞬間、ED-8)。再生状態はそのまま */
  startTrial(duration = 1.1): void {
    if (!this.mech) return;
    const dir = this.rpm < 0 ? -1 : 1;
    this.trial = { t0: null, from: this.theta, delta: dir * TAU, duration };
    this.emitState();
    this.ensureLoop();
  }

  /** カメラが変わったときなど、角度はそのままで描き直す */
  redraw(): void {
    this.emitFrame();
  }

  /**
   * 1 フレーム進める。描いたら true。
   * maxFps を超える呼び出しは間引く(高リフレッシュレートの画面でも 60fps 以下)。
   */
  tick(now: number): boolean {
    const minInterval = 1000 / this.maxFps - 1;
    if (now - this.lastDraw < minInterval) return false;
    const dt =
      this.lastTime === null ? 0 : Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    let moved = false;
    if (this.trial) {
      const tr = this.trial;
      if (tr.t0 === null) tr.t0 = now;
      const p = Math.min(1, (now - tr.t0) / 1000 / tr.duration);
      this.theta = tr.from + tr.delta * EASINGS.glide(p);
      moved = true;
      if (p >= 1) {
        this.trial = null;
        this.emitState();
      }
    } else if (this.playing && this.rpm !== 0 && this.mech) {
      this.theta += rpmToRadPerSec(this.rpm) * dt;
      moved = dt > 0;
    }
    if (!moved) return false;
    this.lastDraw = now;
    this.solve(false);
    this.emitFrame();
    return true;
  }

  /** requestAnimationFrame のループを始める(コンポーネントのマウント時) */
  start(
    raf: ((cb: (t: number) => void) => number) | null = typeof requestAnimationFrame === 'function'
      ? (cb) => requestAnimationFrame(cb)
      : null,
    caf: (id: number) => void = (id) => cancelAnimationFrame(id),
  ): void {
    this.rafImpl = raf;
    this.cafImpl = caf;
    this.running = true;
    this.ensureLoop();
  }

  stop(): void {
    this.running = false;
    if (this.raf && this.cafImpl) this.cafImpl(this.raf);
    this.raf = 0;
    this.lastTime = null;
  }

  subscribe(fn: FrameListener): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  subscribeState = (fn: () => void): (() => void) => {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  };

  private ensureLoop(): void {
    if (!this.running || this.raf || !this.rafImpl) return;
    if (!(this.playing || this.trial)) return;
    this.raf = this.rafImpl((t) => {
      this.raf = 0;
      this.tick(t);
      this.ensureLoop();
    });
  }

  private solve(reset: boolean): void {
    const mech = this.mech;
    if (!mech) {
      this.current = null;
      return;
    }
    // 前フレームの姿勢を初期値にして組立モードを連続にする(S-02)。
    // 設計が変わった直後や前フレームが組立不能だったときは、1 回転のサンプルの近い姿勢から始める。
    // 角度が大きく飛んだとき(スライダ操作)も前フレームは当てにならない
    const jump = Math.abs(this.theta - this.solvedTheta) > MAX_CONTINUOUS_STEP;
    let prev: Float64Array | null = null;
    let predict: Float64Array | null = null;
    const n2 = mech.jointIds.length * 2;
    const continuous =
      !reset && !jump && !!this.current?.ok && this.current.positions.length === n2;
    const step = this.theta - this.solvedTheta;
    if (continuous) {
      prev = this.current!.positions;
      // もう一方のバッファには 1 つ前の姿勢が残っている。刻みの比で直線外挿する
      const ratio = this.lastStep !== 0 ? step / this.lastStep : 0;
      if (ratio > 0 && ratio < 4) {
        if (this.pred.length !== n2) this.pred = new Float64Array(n2);
        predict = extrapolatePose(prev, this.bufs[this.which === 0 ? 1 : 0], ratio, this.pred);
      }
    } else if (this.cycle) {
      const k = nearestSample(this.cycle, this.theta);
      if (k >= 0 && this.cycle.ok[k]) prev = this.cycle.positions[k] ?? null;
    }
    this.which = 1 - this.which;
    const out = this.bufs[this.which];
    this.current = solvePose(mech, this.theta, { prev, predict, out });
    this.lastStep = continuous && this.current.ok ? step : 0;
    this.solvedTheta = this.theta;
  }

  private emitFrame(): void {
    for (const fn of this.frameListeners) fn(this);
  }

  private emitState(): void {
    this.stateVersion++;
    for (const fn of this.stateListeners) fn();
  }
}

/**
 * 1 回転のサンプルを線形補間して、角度 theta での点の位置を返す(脚列のプレビュー用)。
 * サンプルは 0 から +方向に等間隔(sampleCycle の既定)。
 */
export function interpolateCycle(
  cycle: CycleSample,
  jointIndex: number,
  theta: number,
): { x: number; y: number } | null {
  const n = cycle.steps;
  if (n <= 0 || jointIndex < 0) return null;
  const u = (wrapAngle(theta) / TAU) * n;
  const k0 = Math.floor(u) % n;
  const k1 = (k0 + 1) % n;
  const t = u - Math.floor(u);
  const a = cycle.positions[k0];
  const b = cycle.positions[k1];
  if (!a || !b) return null;
  const i = jointIndex * 2;
  return { x: a[i]! + (b[i]! - a[i]!) * t, y: a[i + 1]! + (b[i + 1]! - a[i + 1]!) * t };
}
