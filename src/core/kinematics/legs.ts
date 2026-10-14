import type { DesignDoc } from '@/core/model/types';
import { CM } from '@/core/model/types';
import type { LegInstance } from '@/core/sim/types';
import { compileMechanism, type CompiledMechanism } from './compile';
import { poseDerivative, solvePose } from './solve';

/**
 * E-06 脚列の複製。
 * 片脚の設計を奥行き方向(z)に並べ、組ごとにクランク位相をずらす。
 * mirrorX のときは各組に前後反転した脚を足す。反転脚はクランクピンを共有する
 * (同じモーター角でピン位置が一致するよう位相を補正済みの設計を mirrorDesignX が返す)。
 */
export function legInstances(design: DesignDoc): LegInstance[] {
  const { count, phaseStepDeg, spacing, mirrorX } = design.legs;
  const groups = Math.max(1, Math.floor(count));
  const perGroup = mirrorX ? 2 : 1;
  const slots = groups * perGroup;
  const out: LegInstance[] = [];
  for (let g = 0; g < groups; g++) {
    const phase = (g * phaseStepDeg * Math.PI) / 180;
    for (let m = 0; m < perGroup; m++) {
      const k = g * perGroup + m;
      out.push({ z: (k - (slots - 1) / 2) * spacing * CM, mirrored: m === 1, phase });
    }
  }
  return out;
}

/**
 * 前後反転(x → 2·px − x)した設計。px は最初のクランクの軸の x(クランクがなければ 0)。
 * 反転後もクランクピンが元の脚と同じ位置に来るよう、クランク位相を 2φ0 − π だけ補正する。
 */
export function mirrorDesignX(design: DesignDoc): DesignDoc {
  const byId = new Map(design.joints.map((j) => [j.id, j]));
  const firstPivot = design.cranks[0] ? byId.get(design.cranks[0].pivot) : undefined;
  const px = firstPivot?.x ?? 0;
  const cranks = design.cranks.map((c) => {
    const pivot = byId.get(c.pivot);
    const link = design.links.find((l) => l.id === c.link);
    const pinId = link?.joints.find((id) => id !== c.pivot);
    const pin = pinId ? byId.get(pinId) : undefined;
    if (!pivot || !pin) return { ...c };
    const phi0 = Math.atan2(pin.y - pivot.y, pin.x - pivot.x);
    return { ...c, phase: c.phase + 2 * phi0 - Math.PI };
  });
  return {
    ...design,
    joints: design.joints.map((j) => ({ ...j, x: 2 * px - j.x })),
    cranks,
  };
}

/**
 * 脚列をまとめて毎フレーム解くための準備(E-06、試走ビュー・3D 表示向け)。
 * 通常の脚と反転した脚の解法を 1 回ずつ作って全組で共有し、組ごとの位置バッファを使い回す。
 */
export interface LegSet {
  design: DesignDoc;
  instances: LegInstance[];
  /** 通常の脚の解法 */
  normal: CompiledMechanism;
  /** 前後反転した脚の解法(mirrorX でなければ null) */
  mirrored: CompiledMechanism | null;
  /** 組ごとの最新の位置(設計座標 cm、[x0, y0, ...])。solveLegInstances のたびに中身が変わる */
  positions: Float64Array[];
  /** 組ごとの ∂p/∂θ(cm/rad)。solveLegInstances に derivatives: true を渡したときだけ更新する */
  derivatives: Float64Array[];
  /** 組ごとに組み立てられたか */
  ok: boolean[];
  /** 最後に解いたモーター角(rad)。まだ解いていなければ null */
  theta: number | null;
  /** 組ごとの作業用バッファ(前フレームの位置) */
  scratch: Float64Array[];
}

export interface SolveLegOptions {
  /** ∂p/∂θ も求める(S-04 のトルク計算用) */
  derivatives?: boolean;
  /** 1 回に進めるモーター角の上限(rad)。これより大きく飛ぶときは細かく刻んで組立モードをたどる。既定 5° */
  maxStep?: number;
}

export function compileLegSet(design: DesignDoc): LegSet {
  const instances = legInstances(design);
  const normal = compileMechanism(design);
  const mirrored = instances.some((i) => i.mirrored)
    ? compileMechanism(mirrorDesignX(design))
    : null;
  const size = normal.jointIds.length * 2;
  const alloc = () => instances.map(() => new Float64Array(size));
  return {
    design,
    instances,
    normal,
    mirrored,
    positions: alloc(),
    derivatives: alloc(),
    ok: instances.map(() => false),
    theta: null,
    scratch: alloc(),
  };
}

/** k 番目の組の解法 */
export function legMechanism(set: LegSet, k: number): CompiledMechanism {
  return set.instances[k]?.mirrored && set.mirrored ? set.mirrored : set.normal;
}

/** k 番目の組を solvePose に渡すときの角度(モーター角 + 組の位相) */
export function legTheta(set: LegSet, k: number, theta: number): number {
  return theta + (set.instances[k]?.phase ?? 0);
}

/**
 * モーター角 theta で全組を解く。各組は前回の自分の解を prev にして組立モードを保つ(S-02)。
 * 初回は設計姿勢から、前回から maxStep より大きく飛んだときは前回の角度から、近い向きに細かく刻んで回す。
 * 戻り値:全組が組み立てられたか(組ごとの結果は set.ok)
 */
export function solveLegInstances(
  set: LegSet,
  theta: number,
  options: SolveLegOptions = {},
): boolean {
  const maxStep = options.maxStep ?? (5 * Math.PI) / 180;
  let all = true;
  for (let k = 0; k < set.instances.length; k++) {
    const mech = legMechanism(set, k);
    const target = legTheta(set, k, theta);
    // 刻み始める角度:前回の角度、初回は設計姿勢(最初のクランクの角度が 0 になる角度)
    let from: number;
    let prev: Float64Array | null;
    if (set.theta === null) {
      from = -(mech.design.cranks[0]?.phase ?? 0);
      prev = null;
    } else {
      from = legTheta(set, k, set.theta);
      prev = set.positions[k]!;
    }
    const diff = wrapAngle(target - from);
    const n = Math.min(720, Math.ceil(Math.abs(diff) / maxStep));
    let ok = true;
    for (let s = set.theta === null ? 0 : 1; s <= n; s++) {
      const th = s === n ? target : from + (diff * s) / n;
      // 出力と prev が同じバッファにならないよう、2 つを入れ替えて使う
      const out = set.scratch[k]!;
      const res = solvePose(mech, th, { prev, out });
      set.scratch[k] = set.positions[k]!;
      set.positions[k] = res.positions;
      prev = res.positions;
      ok = res.ok;
    }
    if (n === 0 && set.theta !== null) {
      const res = solvePose(mech, target, { prev, out: set.scratch[k]! });
      set.scratch[k] = set.positions[k]!;
      set.positions[k] = res.positions;
      ok = res.ok;
    }
    set.ok[k] = ok;
    all &&= ok;
    if (options.derivatives) {
      poseDerivative(mech, target, set.positions[k]!, { out: set.derivatives[k]! });
    }
  }
  set.theta = theta;
  return all;
}

/** 角度差を (−π, π] に */
function wrapAngle(a: number): number {
  const TAU = 2 * Math.PI;
  let d = a % TAU;
  if (d <= -Math.PI) d += TAU;
  else if (d > Math.PI) d -= TAU;
  return d;
}
