import type { CompiledMechanism } from '@/core/kinematics/compile';
import { solvePose } from '@/core/kinematics/solve';
import { CM, type DesignDoc } from '@/core/model/types';
import { PART_SPECS, linkLengthCm } from '@/core/model/parts';
import type { LegInstance } from './types';

/**
 * 機体の質量モデル(SIM-2)。
 *
 * - 部品の質量は `PART_SPECS` から(`computeBill` と同じ式)。コスト・重量表示と物理が一致する
 * - リンクの質量はそのリンクのジョイントに等分して集中させる。ピン・固定点はそのジョイントに置く
 * - 脚は動くが、機体は 1 つの剛体として扱うため、各ジョイントの位置をクランク 1 回転で平均した
 *   一次・二次モーメントから、一定の重心と慣性テンソルを作る(脚の振りによる内部運動量は無視)
 * - 胴体は固定点と脚列の z 範囲を覆う箱(`chassisMass` の一様な直方体)
 */
export interface MassModel {
  /** 全質量(kg) */
  total: number;
  /** 重心(機体ローカル、m) */
  com: [number, number, number];
  /** 重心まわりの慣性テンソル(機体ローカル軸、3×3 行優先) */
  inertia: Float64Array;
  /** 設計ジョイントごとの集中質量(kg)。どの組も同じ */
  jointMass: Float64Array;
  /** 胴体の箱(機体ローカル、m)。角を接触点にも使う */
  chassisMin: [number, number, number];
  chassisMax: [number, number, number];
}

/** 胴体の箱を固定点・脚列から広げる余白(m) */
const CHASSIS_MARGIN = 0.05;
/** 平均に使うクランク角のサンプル数 */
const CYCLE_SAMPLES = 48;

/** 設計ジョイントごとの集中質量(kg)。合計は computeBill の片脚質量と一致する */
export function jointMasses(design: DesignDoc): Float64Array {
  const S = PART_SPECS;
  const index = new Map(design.joints.map((j, i) => [j.id, i]));
  const m = new Float64Array(design.joints.length);
  for (const l of design.links) {
    const idx = l.joints.map((id) => index.get(id)).filter((i) => i !== undefined);
    if (idx.length < 2) continue;
    const pts = idx.map((i) => design.joints[i]!);
    const mass = S.linkBase.mass + linkLengthCm(pts) * S.linkPerCm.mass;
    const unique = [...new Set(idx)];
    for (const i of unique) m[i]! += mass / unique.length;
  }
  design.joints.forEach((j, i) => {
    let bodies = j.fixed ? 1 : 0;
    for (const l of design.links) if (l.joints.includes(j.id)) bodies++;
    m[i]! += Math.max(0, bodies - 1) * S.pin.mass;
    if (j.fixed) m[i]! += S.fixed.mass;
  });
  return m;
}

interface CycleMoments {
  /** ジョイントごとの平均 x, y と x², y², xy の平均(m, m²) */
  mx: Float64Array;
  my: Float64Array;
  mxx: Float64Array;
  myy: Float64Array;
  mxy: Float64Array;
}

function cycleMoments(mech: CompiledMechanism): CycleMoments {
  const n = mech.jointIds.length;
  const acc = {
    mx: new Float64Array(n),
    my: new Float64Array(n),
    mxx: new Float64Array(n),
    myy: new Float64Array(n),
    mxy: new Float64Array(n),
  };
  let count = 0;
  let prev: Float64Array | null = null;
  for (let s = 0; s < CYCLE_SAMPLES; s++) {
    const res = solvePose(mech, (2 * Math.PI * s) / CYCLE_SAMPLES, { prev });
    if (!res.ok) continue;
    prev = res.positions;
    count++;
    for (let j = 0; j < n; j++) {
      const x = res.positions[j * 2]! * CM;
      const y = res.positions[j * 2 + 1]! * CM;
      acc.mx[j]! += x;
      acc.my[j]! += y;
      acc.mxx[j]! += x * x;
      acc.myy[j]! += y * y;
      acc.mxy[j]! += x * y;
    }
  }
  if (count === 0) {
    // 1 度も組み立てられない:設計位置を使う
    for (let j = 0; j < n; j++) {
      const x = mech.designPos[j * 2]! * CM;
      const y = mech.designPos[j * 2 + 1]! * CM;
      acc.mx[j] = x;
      acc.my[j] = y;
      acc.mxx[j] = x * x;
      acc.myy[j] = y * y;
      acc.mxy[j] = x * y;
    }
    return acc;
  }
  for (const a of [acc.mx, acc.my, acc.mxx, acc.myy, acc.mxy]) {
    for (let j = 0; j < n; j++) a[j]! /= count;
  }
  return acc;
}

export function computeMassModel(
  design: DesignDoc,
  instances: LegInstance[],
  mechs: CompiledMechanism[],
  chassisMass: number,
): MassModel {
  const jm = jointMasses(design);
  const n = design.joints.length;

  // 胴体の箱:全ての組の固定点(反転脚は反転後の位置)と z 範囲
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  instances.forEach((inst, k) => {
    const mech = mechs[k]!;
    z0 = Math.min(z0, inst.z);
    z1 = Math.max(z1, inst.z);
    for (let j = 0; j < n; j++) {
      if (!mech.fixed[j]) continue;
      const x = mech.designPos[j * 2]! * CM;
      const y = mech.designPos[j * 2 + 1]! * CM;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  });
  if (!(x0 <= x1)) {
    x0 = x1 = 0;
    y0 = y1 = 0;
  }
  if (!(z0 <= z1)) z0 = z1 = 0;
  const M = CHASSIS_MARGIN;
  const chassisMin: [number, number, number] = [x0 - M, y0 - M, z0 - M];
  const chassisMax: [number, number, number] = [x1 + M, y1 + M, z1 + M];

  // 一次モーメントと、原点まわりの二次モーメント S = Σ m E[r rᵀ]
  let total = 0;
  let fx = 0,
    fy = 0,
    fz = 0;
  const S = new Float64Array(9);
  const addPoint = (m: number, x: number, y: number, z: number) => {
    total += m;
    fx += m * x;
    fy += m * y;
    fz += m * z;
    S[0]! += m * x * x;
    S[1]! += m * x * y;
    S[2]! += m * x * z;
    S[4]! += m * y * y;
    S[5]! += m * y * z;
    S[8]! += m * z * z;
  };

  // 脚:組ごと(反転脚は別の機構)に、ジョイントの 1 回転平均
  const momentsCache = new Map<CompiledMechanism, CycleMoments>();
  instances.forEach((inst, k) => {
    const mech = mechs[k]!;
    let mo = momentsCache.get(mech);
    if (!mo) {
      mo = cycleMoments(mech);
      momentsCache.set(mech, mo);
    }
    const z = inst.z;
    for (let j = 0; j < n; j++) {
      const m = jm[j]!;
      if (m <= 0) continue;
      const x = mo.mx[j]!;
      const y = mo.my[j]!;
      total += m;
      fx += m * x;
      fy += m * y;
      fz += m * z;
      S[0]! += m * mo.mxx[j]!;
      S[1]! += m * mo.mxy[j]!;
      S[2]! += m * x * z;
      S[4]! += m * mo.myy[j]!;
      S[5]! += m * y * z;
      S[8]! += m * z * z;
    }
  });

  // クランク(モーターと軸):各クランクの軸の位置、z は脚列の中央
  const byId = new Map(design.joints.map((j) => [j.id, j]));
  for (const c of design.cranks) {
    const p = byId.get(c.pivot);
    if (!p) continue;
    addPoint(PART_SPECS.crank.mass, p.x * CM, p.y * CM, (z0 + z1) / 2);
  }

  // 胴体の箱:中心に質量、自身の慣性は後で足す
  const bx = (chassisMin[0] + chassisMax[0]) / 2;
  const by = (chassisMin[1] + chassisMax[1]) / 2;
  const bz = (chassisMin[2] + chassisMax[2]) / 2;
  const cm = Math.max(0, chassisMass);
  if (cm > 0) addPoint(cm, bx, by, bz);

  if (total <= 0) {
    // 質量がない機体(空の設計で胴体質量 0):1kg の点として扱う
    addPoint(1, bx, by, bz);
  }
  S[3] = S[1]!;
  S[6] = S[2]!;
  S[7] = S[5]!;

  const cx = fx / total;
  const cy = fy / total;
  const cz = fz / total;
  // 重心まわりの二次モーメント:S_c = S - M c cᵀ
  const Sc = new Float64Array(9);
  const c = [cx, cy, cz];
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++) Sc[a * 3 + b] = S[a * 3 + b]! - total * c[a]! * c[b]!;
  // 点質量の慣性:I = tr(S) I − S
  const tr = Sc[0]! + Sc[4]! + Sc[8]!;
  const I = new Float64Array(9);
  for (let a = 0; a < 3; a++)
    for (let b = 0; b < 3; b++) I[a * 3 + b] = (a === b ? tr : 0) - Sc[a * 3 + b]!;
  // 胴体の箱の自身の慣性
  if (cm > 0) {
    const sx = chassisMax[0] - chassisMin[0];
    const sy = chassisMax[1] - chassisMin[1];
    const sz = chassisMax[2] - chassisMin[2];
    I[0]! += (cm / 12) * (sy * sy + sz * sz);
    I[4]! += (cm / 12) * (sx * sx + sz * sz);
    I[8]! += (cm / 12) * (sx * sx + sy * sy);
  }
  // 特異にならないよう、ごく小さな等方成分を足す
  const reg = 1e-4 * total * 0.01;
  I[0]! += reg;
  I[4]! += reg;
  I[8]! += reg;

  return { total, com: [cx, cy, cz], inertia: I, jointMass: jm, chassisMin, chassisMax };
}
