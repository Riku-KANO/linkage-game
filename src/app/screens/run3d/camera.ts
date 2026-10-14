import type { Vec3 } from '@/core/sim/types';
import type { CameraPose, StationContext } from '@/scene';
import {
  createSpring3,
  DEFAULT_FOLLOW,
  followCameraGoal,
  followLookTarget,
  liftAboveTerrain,
  snapSpring3,
  stepSpring3,
  type FollowParams,
  type SpringParams,
  type Spring3,
} from '@/testrun/follow';
import { SPRINGS } from '@/ui/tokens';

/**
 * 試走・結果画面のカメラの定位置(scene の setStationOverride に渡す姿勢)。純粋な計算。
 *
 *  - 試走:testrun の追従カメラ(TR-3)と同じ計算で、重心を先読みつきでばね(SPRINGS.follow)で追う姿勢。
 *    カメラを直接動かすのは scene のカメラリグだけ(遷移・スキップ・reduced-motion をそちらに任せる)。
 *    ここは毎フレームの「行き先」を作るだけで、リグはそれにばねで寄る
 *  - 結果:右に寄せた結果パネルが機械を隠さないよう、カメラを横へずらして機械を画面の左寄りに置く
 */

/** 追従カメラの状態(毎フレーム書き換える) */
export interface FollowRig {
  look: Spring3;
  cam: Spring3;
  lookGoal: Vec3;
  camGoal: Vec3;
  /** 一度でも姿勢を求めたか(false の間は定位置を差し替えない) */
  active: boolean;
  lastTime: number;
  /** 求めた姿勢(位置と注視点だけ。画角などは既定の定位置のものを使う) */
  position: [number, number, number];
  target: [number, number, number];
}

export function createFollowRig(): FollowRig {
  return {
    look: createSpring3(),
    cam: createSpring3(),
    lookGoal: { x: 0, y: 0, z: 0 },
    camGoal: { x: 0, y: 0, z: 0 },
    active: false,
    lastTime: 0,
    position: [0, 0, 0],
    target: [0, 0, 0],
  };
}

export function resetFollowRig(rig: FollowRig): void {
  rig.active = false;
  rig.lastTime = 0;
}

export interface FollowInput {
  /** 追う点(重心、工房の座標) */
  focus: Vec3;
  /** 機体の速度(先読みに使う) */
  velocity: Vec3;
  /** シミュレーション時刻(戻ったらばねを使わず合わせる) */
  time: number;
  /** 距離の倍率(機械の大きさ m の目安) */
  scale: number;
  /** (x, z) の地形の高さ(工房の座標)。なければ -Infinity */
  heightAt: (x: number, z: number) => number;
  /** 実時間の刻み(s) */
  dt: number;
  params?: FollowParams;
  spring?: SpringParams;
}

/**
 * 追従カメラを 1 フレーム進める(testrun の FollowCamera と同じ規則:最初と、時刻が戻ったとき・
 * 大きく飛んだときはばねを使わず合わせる。ばねの途中でも地形に潜らない)。
 */
export function stepFollowRig(rig: FollowRig, input: FollowInput): void {
  const p = input.params ?? DEFAULT_FOLLOW;
  const spring = input.spring ?? SPRINGS.follow;
  const scale = Math.max(0.1, input.scale);
  followLookTarget(input.focus, input.velocity, p, rig.lookGoal);
  followCameraGoal(rig.lookGoal, p, scale, rig.camGoal);
  liftAboveTerrain(rig.camGoal, rig.lookGoal, input.heightAt, p.clearance);
  const lg = rig.lookGoal;
  const far = Math.hypot(rig.look.x - lg.x, rig.look.y - lg.y, rig.look.z - lg.z) > 6 * scale;
  if (!rig.active || input.time < rig.lastTime - 1e-6 || far) {
    snapSpring3(rig.cam, rig.camGoal.x, rig.camGoal.y, rig.camGoal.z);
    snapSpring3(rig.look, lg.x, lg.y, lg.z);
    rig.active = true;
  } else {
    const dt = Math.min(Math.max(0, input.dt), 0.1);
    stepSpring3(rig.look, lg.x, lg.y, lg.z, spring, dt);
    stepSpring3(rig.cam, rig.camGoal.x, rig.camGoal.y, rig.camGoal.z, spring, dt);
  }
  rig.lastTime = input.time;
  const cam = { x: rig.cam.x, y: rig.cam.y, z: rig.cam.z };
  const look = { x: rig.look.x, y: rig.look.y, z: rig.look.z };
  if (liftAboveTerrain(cam, look, input.heightAt, p.clearance)) {
    rig.cam.y = cam.y;
    if (rig.cam.vy < 0) rig.cam.vy = 0;
  }
  rig.position[0] = rig.cam.x;
  rig.position[1] = rig.cam.y;
  rig.position[2] = rig.cam.z;
  rig.target[0] = rig.look.x;
  rig.target[1] = rig.look.y;
  rig.target[2] = rig.look.z;
}

/** 追従カメラの姿勢を定位置に当てる(画角・上方向・投影は base のまま)。まだなければ null */
export function followPose(rig: FollowRig, base: CameraPose): CameraPose | null {
  if (!rig.active) return null;
  base.position[0] = rig.position[0];
  base.position[1] = rig.position[1];
  base.position[2] = rig.position[2];
  base.target[0] = rig.target[0];
  base.target[1] = rig.target[1];
  base.target[2] = rig.target[2];
  base.up[0] = 0;
  base.up[1] = 1;
  base.up[2] = 0;
  base.ortho = 0;
  return base;
}

/** 結果パネルを右に寄せる画面幅の下限(CSS px)。これより狭いとパネルは下から出る */
export const RESULT_DOCK_MIN_WIDTH = 900;

/**
 * 右に幅 panelPx のパネルがあるとき、注視点が残りの部分の中央に見えるよう、カメラと注視点を
 * カメラの右方向へずらす。base を書き換えて返す。狭い画面(パネルが下に出る)では何もしない。
 */
export function dockPoseLeft(base: CameraPose, ctx: StationContext, panelPx: number): CameraPose {
  if (ctx.width < RESULT_DOCK_MIN_WIDTH || !(panelPx > 0) || base.ortho > 0.5) return base;
  const p = base.position;
  const q = base.target;
  const f = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const dist = Math.hypot(f[0]!, f[1]!, f[2]!);
  if (!(dist > 1e-6)) return base;
  // 右方向 = 視線 × 上
  const u = base.up;
  const r = [f[1]! * u[2] - f[2]! * u[1], f[2]! * u[0] - f[0]! * u[2], f[0]! * u[1] - f[1]! * u[0]];
  const rl = Math.hypot(r[0]!, r[1]!, r[2]!);
  if (!(rl > 1e-9)) return base;
  const aspect = ctx.width / Math.max(1, ctx.height);
  const halfW = dist * Math.tan((base.fov * Math.PI) / 360) * aspect;
  // 注視点の NDC の x を −panel/width にする(パネルを除いた部分の中央)
  const s = (Math.min(panelPx, ctx.width * 0.7) / ctx.width) * halfW;
  for (let k = 0; k < 3; k++) {
    const d = (r[k]! / rl) * s;
    p[k] = p[k]! + d;
    q[k] = q[k]! + d;
  }
  return base;
}
