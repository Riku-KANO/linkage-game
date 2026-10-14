import type { CameraPose } from '../rig/pose';
import type { StationContext } from '../rig/stations';
import type { TransitionPlan } from '../rig/timeline';

/**
 * カメラリグが遷移中に毎フレーム問い合わせる口(演出がその遷移のカメラを受け持つとき姿勢を返す)。
 * rig から fx への依存はこのファイルだけにする。
 *
 * @param plan  リグが進めている遷移
 * @param start 遷移を始めたときのカメラの姿勢
 * @param dest  行き先の定位置(このフレームで求めたもの)
 * @param out   受け持つなら姿勢を書いて true を返す
 */
export type FxCameraHook = (
  plan: TransitionPlan,
  start: CameraPose,
  dest: CameraPose,
  ctx: StationContext,
  out: CameraPose,
) => boolean;

let hook: FxCameraHook | null = null;

export function setFxCameraHook(h: FxCameraHook | null): void {
  hook = h;
}

export function fxCamera(
  plan: TransitionPlan,
  start: CameraPose,
  dest: CameraPose,
  ctx: StationContext,
  out: CameraPose,
): boolean {
  return hook ? hook(plan, start, dest, ctx, out) : false;
}
