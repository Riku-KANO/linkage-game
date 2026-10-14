import type { CompiledMechanism } from '@/core/kinematics/compile';
import { poseDerivative } from '@/core/kinematics/derivative';

/**
 * 各ジョイントのクランク角に対する速度 dp/dθ(cm/rad)を `out` に書く。
 *
 * kinematics の解析的な微分 `poseDerivative`(KIN-4)を使う。与えた姿勢 `pose` そのもので
 * 微分するので組立モードは pose と一致する。動力学側はこの関数だけを通して使う
 * (WASM 版などに差し替えるときはここだけ変える)。
 *
 * @returns 固定点以外の |dp/dθ| の最大値(cm/rad)。死点付近で大きくなる
 */
export function poseRate(
  mech: CompiledMechanism,
  theta: number,
  pose: Float64Array,
  out: Float64Array,
): number {
  poseDerivative(mech, theta, pose, { out });
  const n = mech.jointIds.length;
  let max = 0;
  for (let j = 0; j < n; j++) {
    if (mech.fixed[j]) continue;
    const s = Math.hypot(out[j * 2]!, out[j * 2 + 1]!);
    if (!Number.isFinite(s)) {
      // 念のため:有限でない速度は 0 にする(θ̇ の上限で抑えられないため)
      out[j * 2] = 0;
      out[j * 2 + 1] = 0;
      continue;
    }
    if (s > max) max = s;
  }
  return max;
}
