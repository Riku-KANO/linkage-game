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
  /**
   * 組立不能の原因になった点(届かない 2 円の交点、解けないニュートン法の点、余分な拘束が守れない点)。
   * failedJoints から、上流の失敗に引きずられただけの点を除いたもの。
   */
  causeJoints?: number[];
}

export interface SolveOptions {
  /** 前フレームの位置。交点の 2 解のうち近い方を選ぶ(S-02)。null なら設計姿勢の向きを使う */
  prev?: Float64Array | null;
  /**
   * この角度での予測位置(前の 2 姿勢からの外挿など。`extrapolatePose`)。与えると交点の 2 解のうち
   * これに近い方を選ぶ。変位点(2 解が接する姿勢)を、速度を保ったまま越えるため(KIN-7)
   */
  predict?: Float64Array | null;
  /** ニュートン法の最大反復回数 */
  maxIterations?: number;
  /** 再利用する出力バッファ */
  out?: Float64Array;
}

const NEWTON_TOL = 1e-7;
/** ニュートン法の残差がこれを超えたら組立不能(cm) */
const NEWTON_FAIL = 1e-4;
/** 解いた後のリンク長の検査で許す誤差(cm):絶対 + 相対 */
const CHECK_TOL_ABS = 1e-3;
const CHECK_TOL_REL = 1e-6;

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
  const predict = options.predict && options.predict.length === n * 2 ? options.predict : null;
  const pos = options.out && options.out.length === n * 2 ? options.out : new Float64Array(n * 2);
  const first = runPlan(mech, theta, prev, predict ?? prev, pos, null, options.maxIterations);
  if (first.result.ok || !first.checksFailed || first.nearSingular.length === 0)
    return first.result;
  // 余分なリンク(検査)が守れないとき:変位点付近の交点を反対側の解にして解き直す(KIN-7)。
  // 二重平行四辺形のように、冗長な拘束が正しい組立モードを決める機構のため
  const candidates = [...first.nearSingular].sort((a, b) => a.slack - b.slack);
  const trial = new Float64Array(n * 2);
  for (const c of candidates) {
    const again = runPlan(mech, theta, prev, predict ?? prev, trial, c.step, options.maxIterations);
    if (again.result.ok) {
      pos.set(trial);
      return { ...again.result, positions: pos };
    }
  }
  return runPlan(mech, theta, prev, predict ?? prev, pos, null, options.maxIterations).result;
}

/** 変位点に近いとみなす dyad の余裕(これ未満なら、検査に失敗したとき反対側の解も試す) */
const RETRY_SLACK = 0.35;

interface PlanRun {
  result: SolveResult;
  /** 余分なリンクの検査で失敗したか */
  checksFailed: boolean;
  /** 余裕が小さかった dyad(plan の index) */
  nearSingular: { step: number; slack: number }[];
}

/** 解法プランを 1 回実行する。flipStep の dyad だけ、参照点から遠い方の解を選ぶ */
function runPlan(
  mech: CompiledMechanism,
  theta: number,
  prev: Float64Array | null,
  ref: Float64Array | null,
  pos: Float64Array,
  flipStep: number | null,
  maxIterations: number | undefined,
): PlanRun {
  const n = mech.jointIds.length;
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
  const causeJoints: number[] = [];
  const nearSingular: { step: number; slack: number }[] = [];
  let minSlack = 1;
  let minSlackJoint = -1;
  let residual = 0;
  let checksFailed = false;

  for (let si = 0; si < mech.plan.length; si++) {
    const step = mech.plan[si]!;
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
        // 親の点が失敗していれば、この点は引きずられただけ(原因には数えない)
        const cascaded = failed[step.a] || failed[step.b];
        if (cascaded) markFailed(step.j);
        const res = runDyad(step, pos, ref, si === flipStep);
        if (cascaded) break;
        if (res < 0) {
          markFailed(step.j);
          causeJoints.push(step.j);
          failedLinks.push(step.linkA, step.linkB);
          minSlack = 0;
          minSlackJoint = step.j;
        } else {
          if (res < RETRY_SLACK) nearSingular.push({ step: si, slack: res });
          if (res < minSlack) {
            minSlack = res;
            minSlackJoint = step.j;
          }
        }
        break;
      }
      case 'newton': {
        residual = runNewton(step, pos, maxIterations ?? 40);
        if (residual > NEWTON_FAIL) {
          for (const j of step.unknowns) {
            if (!failed[j]) causeJoints.push(j);
            markFailed(j);
          }
          const worst = worstConstraintLinks(step.constraints, pos);
          failedLinks.push(...worst);
        }
        break;
      }
    }
  }

  // 解法プランが使わなかった拘束(余分なリンク)が守られているか確かめる
  const checks = mech.checks;
  if (checks) {
    for (let c = 0; c < checks.length; c++) {
      const { i, j, d, link } = checks[c]!;
      if (failed[i] || failed[j]) continue;
      const len = Math.hypot(pos[i * 2]! - pos[j * 2]!, pos[i * 2 + 1]! - pos[j * 2 + 1]!);
      if (Math.abs(len - d) <= CHECK_TOL_ABS + CHECK_TOL_REL * d) continue;
      checksFailed = true;
      failedLinks.push(link);
      for (const k of [i, j]) {
        if (mech.fixed[k] || failed[k]) continue;
        markFailed(k);
        causeJoints.push(k);
      }
    }
  }

  return {
    result: {
      ok: failedJoints.length === 0,
      positions: pos,
      failedJoints,
      failedLinks: [...new Set(failedLinks)],
      minSlack,
      minSlackJoint,
      residual,
      causeJoints,
    },
    checksFailed,
    nearSingular,
  };

  function markFailed(j: number) {
    if (failed[j]) return;
    failed[j] = 1;
    failedJoints.push(j);
  }
}

/**
 * 前の 2 姿勢から、次の姿勢を直線で外挿する(KIN-7 の予測位置)。
 * ratio = 今回の角度の刻み / 前回の刻み(等間隔なら 1)。
 */
export function extrapolatePose(
  prev: Float64Array,
  prev2: Float64Array,
  ratio: number,
  out: Float64Array,
): Float64Array {
  for (let i = 0; i < out.length; i++) out[i] = prev[i]! + (prev[i]! - prev2[i]!) * ratio;
  return out;
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
  ref: Float64Array | null,
  flip: boolean,
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
  if (ref) {
    // 参照点(予測位置、なければ前フレームの位置)に近い方
    const qx = ref[step.j * 2]!;
    const qy = ref[step.j * 2 + 1]!;
    const d1 = (p1x - qx) ** 2 + (p1y - qy) ** 2;
    const d2 = (p2x - qx) ** 2 + (p2y - qy) ** 2;
    pickFirst = d1 <= d2;
  } else {
    // (hx, hy) is the left normal of a→b, so +h is the "left" (+1) solution
    pickFirst = step.sign > 0;
  }
  if (flip) pickFirst = !pickFirst;
  pos[step.j * 2] = pickFirst ? p1x : p2x;
  pos[step.j * 2 + 1] = pickFirst ? p1y : p2y;
  return Math.min(1, h / Math.max(1e-9, Math.min(step.ra, step.rb)));
}

/** ニュートン法のステップごとの作業用バッファ(毎フレームの確保を避ける) */
interface NewtonScratch {
  /** ジョイント index → 変数の列(-1:既知の点) */
  col: Int32Array;
  r: Float64Array;
  JtJ: Float64Array;
  Jtr: Float64Array;
  delta: Float64Array;
  backup: Float64Array;
  L: Float64Array;
  y: Float64Array;
  idx: Int32Array;
  g: Float64Array;
}

const newtonScratch = new WeakMap<object, NewtonScratch>();

function scratchFor(step: Extract<SolveStep, { kind: 'newton' }>): NewtonScratch {
  let sc = newtonScratch.get(step);
  if (sc) return sc;
  const dim = step.unknowns.length * 2;
  let maxJoint = 0;
  for (const c of step.constraints) maxJoint = Math.max(maxJoint, c.i, c.j);
  for (const j of step.unknowns) maxJoint = Math.max(maxJoint, j);
  const col = new Int32Array(maxJoint + 1).fill(-1);
  step.unknowns.forEach((j, k) => (col[j] = k * 2));
  sc = {
    col,
    r: new Float64Array(step.constraints.length),
    JtJ: new Float64Array(dim * dim),
    Jtr: new Float64Array(dim),
    delta: new Float64Array(dim),
    backup: new Float64Array(dim),
    L: new Float64Array(dim * dim),
    y: new Float64Array(dim),
    idx: new Int32Array(4),
    g: new Float64Array(4),
  };
  newtonScratch.set(step, sc);
  return sc;
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
  const unknowns = step.unknowns;
  const m = unknowns.length;
  const dim = m * 2;
  const sc = scratchFor(step);
  const { col, r, JtJ, Jtr, delta, backup, idx, g } = sc;
  const cs = step.constraints;
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
      const ci = col[i]!;
      const cj = col[j]!;
      let cnt = 0;
      if (ci >= 0) {
        idx[cnt] = ci;
        g[cnt++] = ux;
        idx[cnt] = ci + 1;
        g[cnt++] = uy;
      }
      if (cj >= 0) {
        idx[cnt] = cj;
        g[cnt++] = -ux;
        idx[cnt] = cj + 1;
        g[cnt++] = -uy;
      }
      for (let p = 0; p < cnt; p++) {
        const a = idx[p]!;
        const ga = g[p]!;
        Jtr[a]! += ga * r[c]!;
        for (let q = 0; q < cnt; q++) JtJ[a * dim + idx[q]!]! += ga * g[q]!;
      }
    }
    // try steps with increasing damping until the error decreases
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      if (!solveDamped(JtJ, Jtr, lambda, dim, delta, sc.L, sc.y)) {
        lambda *= 10;
        continue;
      }
      for (let k = 0; k < m; k++) {
        const j = unknowns[k]!;
        backup[k * 2] = pos[j * 2]!;
        backup[k * 2 + 1] = pos[j * 2 + 1]!;
        pos[j * 2]! -= delta[k * 2]!;
        pos[j * 2 + 1]! -= delta[k * 2 + 1]!;
      }
      const e2 = evalResiduals(cs, pos, r);
      if (e2 < err) {
        err = e2;
        lambda = Math.max(1e-9, lambda * 0.3);
        improved = true;
        break;
      }
      for (let k = 0; k < m; k++) {
        const j = unknowns[k]!;
        pos[j * 2] = backup[k * 2]!;
        pos[j * 2 + 1] = backup[k * 2 + 1]!;
      }
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

/** (JtJ + λ diag) x = Jtr をコレスキー分解で解く。L(n×n)と y(n)は作業用 */
function solveDamped(
  A: Float64Array,
  b: Float64Array,
  lambda: number,
  n: number,
  x: Float64Array,
  L: Float64Array,
  y: Float64Array,
): boolean {
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
  /** 各ステップの minSlack(solvePose と同じ。組立不能なステップは 0) */
  slack?: Float64Array;
  /** 各ステップの minSlackJoint(-1:dyad がない) */
  slackJoint?: Int32Array;
  /** 1 回転のどこかで組立不能の原因になったリンク index(昇順) */
  failedLinks?: number[];
  /** 1 回転のどこかで組立不能の原因になった点 index(昇順) */
  causeJoints?: number[];
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
  const slack = new Float64Array(steps);
  const slackJoint = new Int32Array(steps);
  const failedLinks = new Set<number>();
  const causeJoints = new Set<number>();
  let prev: Float64Array | null = null;
  let prev2: Float64Array | null = null;
  const predict = new Float64Array(mech.jointIds.length * 2);
  let minSlack = 1;
  for (let s = 0; s < steps; s++) {
    const th = start + (dir * 2 * Math.PI * s) / steps;
    thetas[s] = th;
    // 等間隔なので前の 2 姿勢から直線で外挿した位置を予測に使う(変位点を速度を保って越える)
    const pred = prev && prev2 ? extrapolatePose(prev, prev2, 1, predict) : null;
    const res = solvePose(mech, th, { prev, predict: pred });
    positions.push(res.positions);
    ok.push(res.ok);
    slack[s] = res.minSlack;
    slackJoint[s] = res.minSlackJoint;
    for (const l of res.failedLinks) failedLinks.add(l);
    if (res.causeJoints) for (const j of res.causeJoints) causeJoints.add(j);
    minSlack = Math.min(minSlack, res.minSlack);
    prev2 = res.ok ? prev : null;
    prev = res.positions;
  }
  const asc = (a: number, b: number) => a - b;
  return {
    steps,
    thetas,
    positions,
    ok,
    fullRotation: ok.every(Boolean),
    minSlack,
    slack,
    slackJoint,
    failedLinks: [...failedLinks].sort(asc),
    causeJoints: [...causeJoints].sort(asc),
  };
}

/** 解いた位置から joint の座標を取り出す */
export function jointPos(positions: Float64Array, index: number): { x: number; y: number } {
  return { x: positions[index * 2]!, y: positions[index * 2 + 1]! };
}

/** S-04 クランク角に対する各点の速度 ∂p/∂θ(実装は derivative.ts) */
export { poseDerivative, type PoseDerivativeOptions } from './derivative';
