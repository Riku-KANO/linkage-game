import type { CompiledMechanism } from '@/core/kinematics/compile';
import { solvePose } from '@/core/kinematics/solve';

/** 差分の刻み(rad) */
const H = 5e-4;

/**
 * 各ジョイントのクランク角に対する速度 dp/dθ(cm/rad)を求める。
 *
 * いまは組立モードを保った中心差分(θ±h を、現在の姿勢 `pose` を prev にして解く)。
 * 片側が組み立てられないときは片側差分、両側とも無理なら 0。
 * kinematics の `poseDerivative`(KIN-4)ができたら、この関数の中身だけを差し替える。
 *
 * @returns 固定点以外の |dp/dθ| の最大値(cm/rad)
 */
export function poseRate(
  mech: CompiledMechanism,
  theta: number,
  pose: Float64Array,
  out: Float64Array,
  scratchA: Float64Array,
  scratchB: Float64Array,
): number {
  const n = mech.jointIds.length;
  const plus = solvePose(mech, theta + H, { prev: pose, out: scratchA });
  const minus = solvePose(mech, theta - H, { prev: pose, out: scratchB });
  const p = plus.positions;
  const m = minus.positions;
  let max = 0;
  for (let i = 0; i < n * 2; i++) {
    let v: number;
    if (plus.ok && minus.ok) v = (p[i]! - m[i]!) / (2 * H);
    else if (plus.ok) v = (p[i]! - pose[i]!) / H;
    else if (minus.ok) v = (pose[i]! - m[i]!) / H;
    else v = 0;
    out[i] = v;
  }
  for (let j = 0; j < n; j++) {
    if (mech.fixed[j]) continue;
    const s = Math.hypot(out[j * 2]!, out[j * 2 + 1]!);
    if (s > max) max = s;
  }
  return max;
}
