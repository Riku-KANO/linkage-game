import type { DesignDoc } from '@/core/model/types';
import { GHOST_STRIDE, ghostDuration, ghostFrameCount, type Ghost } from '@/core/model/ghost';
import type { Quat, SimSnapshot, Vec3 } from '@/core/sim/types';
import { createLegSolver } from './legs';
import { createEmptySnapshot } from './snapshot';

/**
 * ゴースト(TR-6)の再生:記録された機体の姿勢とモーター角から、脚の姿勢を運動学で再現して
 * スナップショットの形にする。描画は MachineModel をそのまま使う。
 */

export interface GhostPose {
  position: Vec3;
  quaternion: Quat;
  motorAngle: number;
}

/**
 * sampleGhost(core/model)と同じ補間を、割り当てなしで out に書く版。
 * 位置・モーター角は線形、向きは近い側に符号をそろえた正規化線形補間。範囲外は端に留める。
 */
export function sampleGhostInto(g: Ghost, t: number, out: GhostPose): boolean {
  const n = ghostFrameCount(g);
  if (n === 0) return false;
  const u = Math.min(n - 1, Math.max(0, (Number.isFinite(t) ? t : 0) * g.hz));
  const i = Math.max(0, Math.min(n - 2, Math.floor(u)));
  const j = n === 1 ? 0 : i + 1;
  const s = n === 1 ? 0 : u - i;
  const f = g.frames;
  const a = i * GHOST_STRIDE;
  const b = j * GHOST_STRIDE;
  out.position.x = lerpAt(f, a, b, 0, s);
  out.position.y = lerpAt(f, a, b, 1, s);
  out.position.z = lerpAt(f, a, b, 2, s);
  let dot = 0;
  for (let c = 3; c < 7; c++) dot += (f[a + c] ?? 0) * (f[b + c] ?? 0);
  const sign = dot < 0 ? -1 : 1;
  const qx = signedLerpAt(f, a, b, 3, s, sign);
  const qy = signedLerpAt(f, a, b, 4, s, sign);
  const qz = signedLerpAt(f, a, b, 5, s, sign);
  const qw = signedLerpAt(f, a, b, 6, s, sign);
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  out.quaternion.x = qx / len;
  out.quaternion.y = qy / len;
  out.quaternion.z = qz / len;
  out.quaternion.w = qw / len;
  out.motorAngle = lerpAt(f, a, b, 7, s);
  return true;
}

function lerpAt(f: number[], a: number, b: number, c: number, s: number): number {
  const va = f[a + c] ?? 0;
  return va + ((f[b + c] ?? 0) - va) * s;
}

function signedLerpAt(
  f: number[],
  a: number,
  b: number,
  c: number,
  s: number,
  sign: number,
): number {
  const va = f[a + c] ?? 0;
  return va + (sign * (f[b + c] ?? 0) - va) * s;
}

export interface GhostPlayer {
  /** 最新の姿勢(update のたびに書き換わる) */
  readonly snapshot: SimSnapshot;
  /** 記録の長さ(s) */
  readonly duration: number;
  /** 時刻 t(s)の姿勢にする。ゴーストが空なら false */
  update(t: number): boolean;
}

export function createGhostPlayer(design: DesignDoc, ghost: Ghost): GhostPlayer {
  const legs = createLegSolver(design);
  const snap = createEmptySnapshot();
  snap.instances = legs.instances.map((i) => ({ ...i }));
  snap.legPositions = legs.instances.map(() => new Float64Array(design.joints.length * 2));
  const pose: GhostPose = {
    position: snap.body.position,
    quaternion: snap.body.quaternion,
    motorAngle: 0,
  };
  let lastT = Number.NaN;
  return {
    snapshot: snap,
    duration: ghostDuration(ghost),
    update(t) {
      if (t === lastT) return true;
      if (!sampleGhostInto(ghost, t, pose)) return false;
      // 巻き戻ったら(リセット)組立モードの記憶を捨てる
      if (t < lastT) legs.reset();
      lastT = t;
      legs.solve(pose.motorAngle);
      for (let k = 0; k < legs.positions.length; k++) snap.legPositions[k]!.set(legs.positions[k]!);
      snap.time = t;
      snap.motorAngle = pose.motorAngle;
      snap.com.x = pose.position.x;
      snap.com.y = pose.position.y;
      snap.com.z = pose.position.z;
      return true;
    },
  };
}
