import { DEFAULT_SIM_PARAMS } from '@/core/sim/types';

/**
 * 試走の時計(S-06 時間操作、S-05 決定論)。
 *
 * 描画フレームの実時間から、固定タイムステップ(既定 240Hz)を何回進めるかを決める。
 * 「リセットからの累積時間(速度倍率をかけたもの)」を持ち、実行済みステップ数との差だけ
 * step() を呼ぶので、step() の回数は累積時間だけで決まり、フレーム時間のばらつきに依存しない。
 *
 *  - 1 フレームあたりのステップ数に上限(maxSubsteps)を設け、追いつけない分は切り捨てる
 *    (処理落ちが処理落ちを呼ぶ「死のスパイラル」を防ぐ)
 *  - 実時間のフレーム長も maxFrameDt で頭打ちにする(タブ切り替えなどの長い空白)
 *  - 速度倍率(一時停止、0.25×、1×、2×、4×)、コマ送り、リセット
 *  - 自動スローなどの追加倍率は advance の timeScale で渡す
 */

/** 選べる速度倍率(一時停止は paused で表す) */
export const SIM_SPEEDS = [0.25, 1, 2, 4] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];

export interface SimClockOptions {
  /** 固定タイムステップ(s)。既定は DEFAULT_SIM_PARAMS.dt(1/240) */
  dt?: number;
  /** 1 フレームで進める最大ステップ数。既定 40(4× を 24fps でも保てる) */
  maxSubsteps?: number;
  /** 1 フレームとして扱う実時間の上限(s)。既定 0.25 */
  maxFrameDt?: number;
}

export interface SimClock {
  readonly dt: number;
  readonly maxSubsteps: number;
  /** リセットから実行したステップ数 */
  readonly steps: number;
  /** シミュレーション時刻(s)= steps × dt */
  readonly simTime: number;
  /** 描画の補間係数 [0, 1):最後のステップから次のステップまでの進み具合 */
  readonly alpha: number;
  readonly speed: SimSpeed;
  readonly paused: boolean;
  /** 直前の advance で上限のために切り捨てたシミュレーション時間(s)。なければ 0 */
  readonly dropped: number;
  setSpeed(speed: number): void;
  setPaused(paused: boolean): void;
  togglePause(): void;
  /**
   * 実時間 frameDt(s)だけ時計を進め、必要な回数だけ step を呼ぶ。戻り値は呼んだ回数。
   * timeScale は速度倍率に掛ける追加の倍率(自動スロー。既定 1)。
   */
  advance(frameDt: number, step: () => void, timeScale?: number): number;
  /** コマ送り:step を 1 回だけ呼ぶ(一時停止中に使う) */
  stepOnce(step: () => void): void;
  /** 時刻 0 に戻す。速度と一時停止は利用者の設定なのでそのまま */
  reset(): void;
}

/** 浮動小数の足し算の誤差でステップの境目がぶれないための余裕(ステップ単位) */
const STEP_EPS = 1e-6;

export function isSimSpeed(v: number): v is SimSpeed {
  return (SIM_SPEEDS as readonly number[]).includes(v);
}

export function createSimClock(options: SimClockOptions = {}): SimClock {
  const dt = options.dt ?? DEFAULT_SIM_PARAMS.dt;
  const maxSubsteps = Math.max(1, Math.floor(options.maxSubsteps ?? 40));
  const maxFrameDt = options.maxFrameDt ?? 0.25;
  if (!(dt > 0)) throw new Error(`clock dt must be positive: ${dt}`);

  /** リセットからの累積シミュレーション時間(切り捨て分を除く) */
  let budget = 0;
  let steps = 0;
  let speed: SimSpeed = 1;
  let paused = false;
  let dropped = 0;

  const clock: SimClock = {
    dt,
    maxSubsteps,
    get steps() {
      return steps;
    },
    get simTime() {
      return steps * dt;
    },
    get alpha() {
      const a = (budget - steps * dt) / dt;
      return a <= 0 ? 0 : a >= 1 ? 1 - 1e-9 : a;
    },
    get speed() {
      return speed;
    },
    get paused() {
      return paused;
    },
    get dropped() {
      return dropped;
    },
    setSpeed(s) {
      if (isSimSpeed(s)) speed = s;
    },
    setPaused(p) {
      paused = p;
    },
    togglePause() {
      paused = !paused;
    },
    advance(frameDt, step, timeScale = 1) {
      dropped = 0;
      if (paused || !(frameDt > 0) || !(timeScale > 0)) return 0;
      const real = Math.min(frameDt, maxFrameDt);
      budget += real * speed * timeScale;
      const target = Math.floor(budget / dt + STEP_EPS);
      let n = target - steps;
      if (n > maxSubsteps) {
        n = maxSubsteps;
        // 追いつけない分は捨てる(次のフレームに持ち越さない)
        const kept = (steps + n) * dt;
        dropped = budget - kept;
        budget = kept;
      }
      for (let i = 0; i < n; i++) {
        step();
        steps++;
      }
      return n > 0 ? n : 0;
    },
    stepOnce(step) {
      step();
      steps++;
      budget = steps * dt;
      dropped = 0;
    },
    reset() {
      budget = 0;
      steps = 0;
      dropped = 0;
    },
  };
  return clock;
}
