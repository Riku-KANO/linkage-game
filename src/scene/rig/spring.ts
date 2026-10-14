/**
 * ばね補間(SPRINGS トークンの stiffness / damping)。フレーム時間がばらついても安定するよう、
 * 長い dt は細かく刻んで半陰的オイラー法で積分する。
 */

export interface SpringParams {
  stiffness: number;
  damping: number;
}

export interface Spring1 {
  x: number;
  v: number;
}

const MAX_STEP = 1 / 240;

/** 1 次元のばねを target へ dt 秒進める(state を書き換えて返す) */
export function springStep(state: Spring1, target: number, p: SpringParams, dt: number): Spring1 {
  let remaining = Math.min(Math.max(dt, 0), 0.25);
  while (remaining > 1e-9) {
    const h = Math.min(MAX_STEP, remaining);
    const a = p.stiffness * (target - state.x) - p.damping * state.v;
    state.v += a * h;
    state.x += state.v * h;
    remaining -= h;
  }
  return state;
}

/**
 * 指数的に target へ近づける(臨界減衰の近似、速度を持たない)。
 * rate は 1 秒あたりの収束の速さ。フレームレートに依存しない。
 */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * Math.max(0, dt));
}
