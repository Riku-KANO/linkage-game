import type { CompiledMechanism, SolveStep } from './compile';

/**
 * S-04 クランク角に対する各点の速度 ∂p/∂θ(cm/rad)。
 *
 * solvePose の解法プランを同じ順にたどり、各ステップを微分して伝える(解析的な微分)。
 * 与えた姿勢 positions そのもので微分するので、組立モードは positions と一致する。
 *  - crank :ピボット回りの回転 → ∂p/∂θ = (−(y − cy), x − cx)
 *  - rigid :基準 2 点 a, b の速度からリンクの角速度 ω を求め、v = v_a + ω × (p − a)
 *  - dyad  :(J − A)·(v_J − v_A) = 0、(J − B)·(v_J − v_B) = 0 の 2×2 連立方程式
 *  - newton:距離拘束の微分 (p_i − p_j)·(v_i − v_j) = 0 を最小二乗で解く
 * 固定点・浮いた点は 0。死点(2 本のリンクが一直線)では値がとても大きくなる(有限に抑える)。
 *
 * モーターに必要なトルクは τ = −Σ F_k · ∂p_k/∂θ(F_k は点 k に外から加わる力)で求められる。
 */
export interface PoseDerivativeOptions {
  /** 再利用する出力バッファ(長さ = ジョイント数 × 2) */
  out?: Float64Array;
}

/** 死点での割り算を抑える下限(det / (|J−A|·|J−B|)) */
const SINGULAR_EPS = 1e-9;

export function poseDerivative(
  mech: CompiledMechanism,
  theta: number,
  positions: Float64Array,
  options: PoseDerivativeOptions = {},
): Float64Array {
  void theta; // positions がすでに θ の姿勢なので、解析的な微分には使わない
  const n = mech.jointIds.length;
  const v = options.out && options.out.length === n * 2 ? options.out : new Float64Array(n * 2);
  v.fill(0);
  const p = positions;
  for (const step of mech.plan) {
    switch (step.kind) {
      case 'crank': {
        const cx = p[step.pivot * 2]!;
        const cy = p[step.pivot * 2 + 1]!;
        for (const j of step.joints) {
          v[j * 2] = -(p[j * 2 + 1]! - cy);
          v[j * 2 + 1] = p[j * 2]! - cx;
        }
        break;
      }
      case 'rigid': {
        const { a, b } = step;
        const ax = p[a * 2]!;
        const ay = p[a * 2 + 1]!;
        const dx = p[b * 2]! - ax;
        const dy = p[b * 2 + 1]! - ay;
        const dvx = v[b * 2]! - v[a * 2]!;
        const dvy = v[b * 2 + 1]! - v[a * 2 + 1]!;
        const L2 = dx * dx + dy * dy || 1;
        const w = (dx * dvy - dy * dvx) / L2;
        for (const t of step.targets) {
          v[t * 2] = v[a * 2]! - w * (p[t * 2 + 1]! - ay);
          v[t * 2 + 1] = v[a * 2 + 1]! + w * (p[t * 2]! - ax);
        }
        break;
      }
      case 'dyad':
        dyadDerivative(step, p, v);
        break;
      case 'newton':
        newtonDerivative(step, p, v);
        break;
    }
  }
  return v;
}

function dyadDerivative(
  step: Extract<SolveStep, { kind: 'dyad' }>,
  p: Float64Array,
  v: Float64Array,
) {
  const { j, a, b } = step;
  const ux = p[j * 2]! - p[a * 2]!;
  const uy = p[j * 2 + 1]! - p[a * 2 + 1]!;
  const wx = p[j * 2]! - p[b * 2]!;
  const wy = p[j * 2 + 1]! - p[b * 2 + 1]!;
  const r1 = ux * v[a * 2]! + uy * v[a * 2 + 1]!;
  const r2 = wx * v[b * 2]! + wy * v[b * 2 + 1]!;
  let det = ux * wy - uy * wx;
  const minDet = SINGULAR_EPS * Math.hypot(ux, uy) * Math.hypot(wx, wy);
  if (Math.abs(det) < minDet) det = det < 0 ? -minDet : minDet || SINGULAR_EPS;
  v[j * 2] = (r1 * wy - uy * r2) / det;
  v[j * 2 + 1] = (ux * r2 - wx * r1) / det;
}

function newtonDerivative(
  step: Extract<SolveStep, { kind: 'newton' }>,
  p: Float64Array,
  v: Float64Array,
) {
  const dim = step.unknowns.length * 2;
  const col = new Map<number, number>();
  step.unknowns.forEach((j, k) => col.set(j, k * 2));
  const A = new Float64Array(dim * dim);
  const rhs = new Float64Array(dim);
  const g = new Float64Array(4);
  const idx = new Int32Array(4);
  for (const c of step.constraints) {
    const dx = p[c.i * 2]! - p[c.j * 2]!;
    const dy = p[c.i * 2 + 1]! - p[c.j * 2 + 1]!;
    // 行:d·(v_i − v_j) = 0。既知の点の速度は右辺へ
    let cnt = 0;
    let r = 0;
    const ci = col.get(c.i);
    const cj = col.get(c.j);
    if (ci !== undefined) {
      idx[cnt] = ci;
      g[cnt++] = dx;
      idx[cnt] = ci + 1;
      g[cnt++] = dy;
    } else r -= dx * v[c.i * 2]! + dy * v[c.i * 2 + 1]!;
    if (cj !== undefined) {
      idx[cnt] = cj;
      g[cnt++] = -dx;
      idx[cnt] = cj + 1;
      g[cnt++] = -dy;
    } else r += dx * v[c.j * 2]! + dy * v[c.j * 2 + 1]!;
    for (let s = 0; s < cnt; s++) {
      rhs[idx[s]!]! += g[s]! * r;
      for (let t = 0; t < cnt; t++) A[idx[s]! * dim + idx[t]!]! += g[s]! * g[t]!;
    }
  }
  let trace = 0;
  for (let i = 0; i < dim; i++) trace += A[i * dim + i]!;
  const ridge = 1e-12 * (trace / Math.max(1, dim) || 1);
  const x = choleskySolve(A, rhs, dim, ridge);
  step.unknowns.forEach((j, k) => {
    v[j * 2] = x[k * 2]!;
    v[j * 2 + 1] = x[k * 2 + 1]!;
  });
}

/** (A + ridge·I) x = b(A は対称半正定値) */
function choleskySolve(A: Float64Array, b: Float64Array, n: number, ridge: number): Float64Array {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * n + j]! + (i === j ? ridge : 0);
      for (let k = 0; k < j; k++) sum -= L[i * n + k]! * L[j * n + k]!;
      if (i === j) L[i * n + i] = Math.sqrt(Math.max(sum, 1e-300));
      else L[i * n + j] = sum / L[j * n + j]!;
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i]!;
    for (let k = 0; k < i; k++) sum -= L[i * n + k]! * y[k]!;
    y[i] = sum / L[i * n + i]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i]!;
    for (let k = i + 1; k < n; k++) sum -= L[k * n + i]! * x[k]!;
    x[i] = sum / L[i * n + i]!;
  }
  return x;
}
