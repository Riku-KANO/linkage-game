import type { CompiledMechanism, DistanceConstraint, SolveStep } from './compile';
import { circleIntersection } from '@/core/math/vec2';

export interface SolveResult {
  /** 全ての点が拘束を満たして求まったか */
  ok: boolean;
  /** 位置 [x0, y0, x1, y1, ...](cm)。失敗した点も描画できるよう、最も近い妥協位置を入れる */
  positions: Float64Array;
  /** 組立不能だった点(届かない)。ok=false の原因 */
  failedJoints: number[];
  /** 組立不能の原因になったリンク index(赤表示用) */
  failedLinks: number[];
  /**
   * dyad の余裕(0..1)。2 円の交点の離れ具合 h/min(ra,rb)。0 に近いほど死点(特異姿勢)に近い。
   * dyad がない機構では 1。
   */
  minSlack: number;
  /** minSlack を与えた点 */
  minSlackJoint: number;
  /** ニュートン法の最終残差(最大絶対値、cm)。ニュートン法を使わなければ 0 */
  residual: number;
}

export interface SolveOptions {
  /** 前フレームの位置。交点の 2 解のうち近い方を選ぶ(S-02)。null なら設計姿勢の向きを使う */
  prev?: Float64Array | null;
  /** ニュートン法の最大反復回数 */
  maxIterations?: number;
  /** 再利用する出力バッファ */
  out?: Float64Array;
}

const NEWTON_TOL = 1e-7;

/**
 * モーター角 theta(rad)での全ジョイント位置を求める(S-01, S-02)。
 */
export function solvePose(
  mech: CompiledMechanism,
  theta: number,
  options: SolveOptions = {},
): SolveResult {
  const n = mech.jointIds.length;
  const prev = options.prev ?? null;
  const pos = options.out && options.out.length === n * 2 ? options.out : new Float64Array(n * 2);
  // start from previous pose (good initial guess for newton, keeps floating joints in place)
  pos.set(prev && prev.length === n * 2 ? prev : mech.designPos);
  // fixed joints are always at design positions
  for (let i = 0; i < n; i++) {
    if (mech.fixed[i]) {
      pos[i * 2] = mech.designPos[i * 2]!;
      pos[i * 2 + 1] = mech.designPos[i * 2 + 1]!;
    }
  }
  for (const f of mech.floating) {
    pos[f * 2] = mech.designPos[f * 2]!;
    pos[f * 2 + 1] = mech.designPos[f * 2 + 1]!;
  }

  const failed = new Uint8Array(n);
  const failedJoints: number[] = [];
  const failedLinks: number[] = [];
  let minSlack = 1;
  let minSlackJoint = -1;
  let residual = 0;

  for (const step of mech.plan) {
    switch (step.kind) {
      case 'crank':
        runCrank(mech, step, theta, pos);
        break;
      case 'rigid': {
        if (failed[step.a] || failed[step.b]) {
          step.targets.forEach((t) => markFailed(t));
        }
        runRigid(step, pos);
        break;
      }
      case 'dyad': {
        if (failed[step.a] || failed[step.b]) markFailed(step.j);
        const res = runDyad(step, pos, prev);
        if (res < 0) {
          if (!failed[step.j]) markFailed(step.j);
          failedLinks.push(step.linkA, step.linkB);
          minSlack = 0;
          minSlackJoint = step.j;
        } else if (res < minSlack) {
          minSlack = res;
          minSlackJoint = step.j;
        }
        break;
      }
      case 'newton': {
        residual = runNewton(step, pos, options.maxIterations ?? 40);
        if (residual > 1e-4) {
          step.unknowns.forEach((j) => markFailed(j));
          const worst = worstConstraintLinks(step.constraints, pos);
          failedLinks.push(...worst);
        }
        break;
      }
    }
  }

  return {
    ok: failedJoints.length === 0,
    positions: pos,
    failedJoints,
    failedLinks: [...new Set(failedLinks)],
    minSlack,
    minSlackJoint,
    residual,
  };

  function markFailed(j: number) {
    if (failed[j]) return;
    failed[j] = 1;
    failedJoints.push(j);
  }
}

function runCrank(
  mech: CompiledMechanism,
  step: Extract<SolveStep, { kind: 'crank' }>,
  theta: number,
  pos: Float64Array,
) {
  const ang = theta + step.phase;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const cx = mech.designPos[step.pivot * 2]!;
  const cy = mech.designPos[step.pivot * 2 + 1]!;
  for (const j of step.joints) {
    const rx = mech.designPos[j * 2]! - cx;
    const ry = mech.designPos[j * 2 + 1]! - cy;
    pos[j * 2] = cx + rx * c - ry * s;
    pos[j * 2 + 1] = cy + rx * s + ry * c;
  }
}

function runRigid(step: Extract<SolveStep, { kind: 'rigid' }>, pos: Float64Array) {
  const ax = pos[step.a * 2]!;
  const ay = pos[step.a * 2 + 1]!;
  const dx = pos[step.b * 2]! - ax;
  const dy = pos[step.b * 2 + 1]! - ay;
  const d = Math.hypot(dx, dy) || 1;
  const ex = dx / d;
  const ey = dy / d;
  step.targets.forEach((t, k) => {
    const u = step.local[k * 2]!;
    const v = step.local[k * 2 + 1]!;
    pos[t * 2] = ax + u * ex - v * ey;
    pos[t * 2 + 1] = ay + u * ey + v * ex;
  });
}

/** 戻り値:slack(0..1)。組立不能なら -1(最も近い妥協位置を書き込む) */
function runDyad(
  step: Extract<SolveStep, { kind: 'dyad' }>,
  pos: Float64Array,
  prev: Float64Array | null,
): number {
  const ax = pos[step.a * 2]!;
  const ay = pos[step.a * 2 + 1]!;
  const bx = pos[step.b * 2]!;
  const by = pos[step.b * 2 + 1]!;
  const hit = circleIntersection(ax, ay, step.ra, bx, by, step.rb);
  if (!hit) {
    // unreachable: put J on the line through a and b, at distance ra from a on the side
    // that best matches rb, so the broken pose is still drawable
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const errToward = Math.abs(Math.abs(d - step.ra) - step.rb);
    const errAway = Math.abs(d + step.ra - step.rb);
    const s = errToward <= errAway ? 1 : -1;
    pos[step.j * 2] = ax + ux * step.ra * s;
    pos[step.j * 2 + 1] = ay + uy * step.ra * s;
    return -1;
  }
  const h = Math.sqrt(hit.h2);
  const p1x = hit.ax + hit.hx * h;
  const p1y = hit.ay + hit.hy * h;
  const p2x = hit.ax - hit.hx * h;
  const p2y = hit.ay - hit.hy * h;
  let pickFirst: boolean;
  if (prev) {
    const qx = prev[step.j * 2]!;
    const qy = prev[step.j * 2 + 1]!;
    const d1 = (p1x - qx) ** 2 + (p1y - qy) ** 2;
    const d2 = (p2x - qx) ** 2 + (p2y - qy) ** 2;
    pickFirst = d1 <= d2;
  } else {
    // (hx, hy) is the left normal of a→b, so +h is the "left" (+1) solution
    pickFirst = step.sign > 0;
  }
  pos[step.j * 2] = pickFirst ? p1x : p2x;
  pos[step.j * 2 + 1] = pickFirst ? p1y : p2y;
  return Math.min(1, h / Math.max(1e-9, Math.min(step.ra, step.rb)));
}

/**
 * レーベンバーグ・マルカート法で距離拘束を満たす。
 * 戻り値:最大残差(cm)
 */
function runNewton(
  step: Extract<SolveStep, { kind: 'newton' }>,
  pos: Float64Array,
  maxIter: number,
): number {
  const m = step.unknowns.length;
  const dim = m * 2;
  const col = new Map<number, number>();
  step.unknowns.forEach((j, k) => col.set(j, k * 2));
  const cs = step.constraints;
  const r = new Float64Array(cs.length);
  const JtJ = new Float64Array(dim * dim);
  const Jtr = new Float64Array(dim);
  const delta = new Float64Array(dim);
  let lambda = 1e-3;
  let err = evalResiduals(cs, pos, r);
  for (let it = 0; it < maxIter && err > NEWTON_TOL; it++) {
    JtJ.fill(0);
    Jtr.fill(0);
    // residual_c = |pi - pj| - d ; dr/dpi = u, dr/dpj = -u
    for (let c = 0; c < cs.length; c++) {
      const { i, j } = cs[c]!;
      const dx = pos[i * 2]! - pos[j * 2]!;
      const dy = pos[i * 2 + 1]! - pos[j * 2 + 1]!;
      const L = Math.hypot(dx, dy) || 1e-9;
      const ux = dx / L;
      const uy = dy / L;
      const ci = col.get(i);
      const cj = col.get(j);
      const entries: [number, number][] = [];
      if (ci !== undefined) entries.push([ci, ux], [ci + 1, uy]);
      if (cj !== undefined) entries.push([cj, -ux], [cj + 1, -uy]);
      for (const [a, ga] of entries) {
        Jtr[a]! += ga * r[c]!;
        for (const [b, gb] of entries) JtJ[a * dim + b]! += ga * gb;
      }
    }
    // try steps with increasing damping until the error decreases
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      if (!solveDamped(JtJ, Jtr, lambda, dim, delta)) {
        lambda *= 10;
        continue;
      }
      const backup = step.unknowns.map((j) => [pos[j * 2]!, pos[j * 2 + 1]!] as const);
      step.unknowns.forEach((j, k) => {
        pos[j * 2]! -= delta[k * 2]!;
        pos[j * 2 + 1]! -= delta[k * 2 + 1]!;
      });
      const e2 = evalResiduals(cs, pos, r);
      if (e2 < err) {
        err = e2;
        lambda = Math.max(1e-9, lambda * 0.3);
        improved = true;
        break;
      }
      step.unknowns.forEach((j, k) => {
        pos[j * 2] = backup[k]![0];
        pos[j * 2 + 1] = backup[k]![1];
      });
      evalResiduals(cs, pos, r);
      lambda *= 10;
    }
    if (!improved) break;
  }
  return err;
}

function evalResiduals(cs: DistanceConstraint[], pos: Float64Array, r: Float64Array): number {
  let max = 0;
  for (let c = 0; c < cs.length; c++) {
    const { i, j, d } = cs[c]!;
    const v = Math.hypot(pos[i * 2]! - pos[j * 2]!, pos[i * 2 + 1]! - pos[j * 2 + 1]!) - d;
    r[c] = v;
    const a = Math.abs(v);
    if (a > max) max = a;
  }
  return max;
}

function worstConstraintLinks(cs: DistanceConstraint[], pos: Float64Array): number[] {
  const out: number[] = [];
  for (const { i, j, d, link } of cs) {
    const v = Math.hypot(pos[i * 2]! - pos[j * 2]!, pos[i * 2 + 1]! - pos[j * 2 + 1]!) - d;
    if (Math.abs(v) > 1e-3) out.push(link);
  }
  return out;
}

/** (JtJ + λ diag) x = Jtr をコレスキー分解で解く */
function solveDamped(
  A: Float64Array,
  b: Float64Array,
  lambda: number,
  n: number,
  x: Float64Array,
): boolean {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * n + j]!;
      if (i === j) sum += lambda * (1 + A[i * n + i]!);
      for (let k = 0; k < j; k++) sum -= L[i * n + k]! * L[j * n + k]!;
      if (i === j) {
        if (sum <= 1e-15) return false;
        L[i * n + i] = Math.sqrt(sum);
      } else {
        L[i * n + j] = sum / L[j * n + j]!;
      }
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i]!;
    for (let k = 0; k < i; k++) sum -= L[i * n + k]! * y[k]!;
    y[i] = sum / L[i * n + i]!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i]!;
    for (let k = i + 1; k < n; k++) sum -= L[k * n + i]! * x[k]!;
    x[i] = sum / L[i * n + i]!;
  }
  return true;
}

export interface CycleSample {
  /** サンプル数 */
  steps: number;
  /** モーター角(rad) */
  thetas: Float64Array;
  /** 各ステップの位置。positions[s] は solvePose の positions と同じ形 */
  positions: Float64Array[];
  /** 各ステップで組み立てられたか */
  ok: boolean[];
  /** 1 回転すべてで組み立てられたか */
  fullRotation: boolean;
  /** 全ステップの最小 slack(死点への近さ) */
  minSlack: number;
}

/**
 * モーター角を 0→2π まで回して全点の軌道を求める(E-03, E-05 の材料)。
 * 前ステップの解を prev として渡すので、組立モードが連続になる。
 */
export function sampleCycle(
  mech: CompiledMechanism,
  steps = 180,
  options: { direction?: 1 | -1; startTheta?: number } = {},
): CycleSample {
  const dir = options.direction ?? 1;
  const start = options.startTheta ?? 0;
  const thetas = new Float64Array(steps);
  const positions: Float64Array[] = [];
  const ok: boolean[] = [];
  let prev: Float64Array | null = null;
  let minSlack = 1;
  for (let s = 0; s < steps; s++) {
    const th = start + (dir * 2 * Math.PI * s) / steps;
    thetas[s] = th;
    const res = solvePose(mech, th, { prev });
    positions.push(res.positions);
    ok.push(res.ok);
    minSlack = Math.min(minSlack, res.minSlack);
    prev = res.positions;
  }
  return { steps, thetas, positions, ok, fullRotation: ok.every(Boolean), minSlack };
}

/** 解いた位置から joint の座標を取り出す */
export function jointPos(positions: Float64Array, index: number): { x: number; y: number } {
  return { x: positions[index * 2]!, y: positions[index * 2 + 1]! };
}
