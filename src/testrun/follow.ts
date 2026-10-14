import type { Vec3 } from '@/core/sim/types';

/**
 * 追従カメラの純粋な計算(TR-3)。three・React に依存しない。
 *
 *  - ばね:減衰振動の厳密解で 1 ステップ進める。目標が一定ならフレームの刻み方によらず同じ軌跡になる
 *  - 注視点:機体(重心)に、進行方向の速度 × 先読み時間を足す(上限つき)
 *  - 地形の回避:カメラと注視点を結ぶ線分が地形より clearance だけ上を通るようにカメラを持ち上げる
 */

export interface SpringParams {
  stiffness: number;
  damping: number;
}

/** 3 軸のばね(位置と速度)。毎フレーム書き換える可変オブジェクト */
export interface Spring3 {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export function createSpring3(x = 0, y = 0, z = 0): Spring3 {
  return { x, y, z, vx: 0, vy: 0, vz: 0 };
}

export function snapSpring3(s: Spring3, x: number, y: number, z: number): void {
  s.x = x;
  s.y = y;
  s.z = z;
  s.vx = 0;
  s.vy = 0;
  s.vz = 0;
}

/** springStep1D の速度の出力先(割り当てを避けるため) */
let outV = 0;

/**
 * 目標 target に向かう 1 次元の減衰ばね x'' = -k (x - target) - c x' を dt だけ厳密に進める。
 * 戻り値は新しい位置。新しい速度は lastSpringVelocity() で読む。
 */
export function springStep1D(
  x: number,
  v: number,
  target: number,
  k: number,
  c: number,
  dt: number,
): number {
  if (!(dt > 0) || !(k > 0)) {
    outV = v;
    return x;
  }
  const w = Math.sqrt(k);
  const zeta = c / (2 * w);
  const x0 = x - target;
  let xr: number;
  let vr: number;
  if (Math.abs(zeta - 1) < 1e-4) {
    // 臨界減衰
    const e = Math.exp(-w * dt);
    const b = v + w * x0;
    xr = (x0 + b * dt) * e;
    vr = (v - w * b * dt) * e;
  } else if (zeta < 1) {
    const wd = w * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-zeta * w * dt);
    const cs = Math.cos(wd * dt);
    const sn = Math.sin(wd * dt);
    const A = x0;
    const B = (v + zeta * w * x0) / wd;
    xr = e * (A * cs + B * sn);
    vr = e * ((B * wd - zeta * w * A) * cs - (A * wd + zeta * w * B) * sn);
  } else {
    const s = Math.sqrt(zeta * zeta - 1);
    const r1 = -w * (zeta - s);
    const r2 = -w * (zeta + s);
    const c2 = (v - r1 * x0) / (r2 - r1);
    const c1 = x0 - c2;
    const e1 = Math.exp(r1 * dt);
    const e2 = Math.exp(r2 * dt);
    xr = c1 * e1 + c2 * e2;
    vr = c1 * r1 * e1 + c2 * r2 * e2;
  }
  outV = vr;
  return target + xr;
}

export function lastSpringVelocity(): number {
  return outV;
}

export function stepSpring3(
  s: Spring3,
  tx: number,
  ty: number,
  tz: number,
  p: SpringParams,
  dt: number,
): void {
  s.x = springStep1D(s.x, s.vx, tx, p.stiffness, p.damping, dt);
  s.vx = outV;
  s.y = springStep1D(s.y, s.vy, ty, p.stiffness, p.damping, dt);
  s.vy = outV;
  s.z = springStep1D(s.z, s.vz, tz, p.stiffness, p.damping, dt);
  s.vz = outV;
}

export interface FollowParams {
  /** 注視点からカメラへのずらし(m)。機械の大きさで拡大して使う */
  offset: Vec3;
  /** 速度の先読み時間(s) */
  lookAhead: number;
  /** 先読みの上限(m) */
  maxLookAhead: number;
  /** 地形からの最小の高さ(m) */
  clearance: number;
}

export const DEFAULT_FOLLOW: FollowParams = {
  // 斜め前方の手前から見下ろす(機構の平面 xy を斜めから見る)
  offset: { x: 0.9, y: 0.75, z: 2.4 },
  lookAhead: 0.8,
  maxLookAhead: 0.6,
  clearance: 0.25,
};

/** 注視点:focus + 進行方向(x)の先読み。out に書いて返す */
export function followLookTarget(focus: Vec3, velocity: Vec3, p: FollowParams, out: Vec3): Vec3 {
  const ahead = clamp(velocity.x * p.lookAhead, -p.maxLookAhead, p.maxLookAhead);
  out.x = focus.x + (Number.isFinite(ahead) ? ahead : 0);
  out.y = focus.y;
  out.z = focus.z;
  return out;
}

/** カメラの目標位置:注視点 + offset × scale */
export function followCameraGoal(look: Vec3, p: FollowParams, scale: number, out: Vec3): Vec3 {
  out.x = look.x + p.offset.x * scale;
  out.y = look.y + p.offset.y * scale;
  out.z = look.z + p.offset.z * scale;
  return out;
}

/**
 * カメラ位置 cam(書き換える)を、注視点 look との線分が地形の上を通るまで持ち上げる。
 * 線分上の点 look + s (cam − look)(s ∈ [sMin, 1])がすべて heightAt + clearance 以上になる
 * cam.y にする(区間ごとに保守的に見積もる)。持ち上げたら true。
 */
export function liftAboveTerrain(
  cam: Vec3,
  look: Vec3,
  heightAt: (x: number, z: number) => number,
  clearance: number,
  samples = 16,
  sMin = 0.3,
): boolean {
  let need = -Infinity;
  // 区間 [s_i, s_i+1] の両端の高い方を、区間の手前側(条件の厳しい側)の s で要求する。
  // サンプル点を 1 つでも含む障害物なら、端がサンプルの間にあっても見落とさない
  let prevS = sMin;
  let prevH = heightAt(look.x + sMin * (cam.x - look.x), look.z + sMin * (cam.z - look.z));
  for (let i = 1; i <= samples; i++) {
    const s = sMin + ((1 - sMin) * i) / samples;
    const h = heightAt(look.x + s * (cam.x - look.x), look.z + s * (cam.z - look.z));
    const hm = Math.max(prevH, h);
    if (Number.isFinite(hm)) {
      // look.y + s (cam.y − look.y) >= hm + clearance
      const y = look.y + (hm + clearance - look.y) / prevS;
      if (y > need) need = y;
    }
    prevS = s;
    prevH = h;
  }
  const hc = heightAt(cam.x, cam.z);
  if (Number.isFinite(hc) && hc + clearance > need) need = hc + clearance;
  if (cam.y < need) {
    cam.y = need;
    return true;
  }
  return false;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
