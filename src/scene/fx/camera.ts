import { copyPose, type CameraPose, type V3 } from '../rig/pose';
import {
  bodyCenter,
  bodyPoseAt,
  createBodyPose,
  createCraneScratch,
  paperScale,
  type BodyPose,
  type CraneInput,
  type CraneScratch,
} from './crane';
import { wrapAngle } from './poses';
import { ASSEMBLY_PHASES, easeInOut, smoothstep } from './timeline';

/**
 * 演出中のカメラ(純粋な計算)。カメラリグの既定の経路(経由点を通る曲線)の代わりに、
 * 組み上げる機械を見て、吊られた機械を追って窓を抜け、試走コースの定位置に着く。
 *
 *  - 設計画面の真上(平行投影) → 作業台の斜め前から組み上がる機械を見る(少しずつ回り込む)
 *  - 吊り上げたら機械の後ろについて窓を抜ける
 *  - 試走(または結果)の定位置へなめらかに移る
 * 分解(T-05)は同じ姿を逆にたどる。試走 → 結果(T-04)は機械の周りを半周する。
 */

const CAM = {
  /** 組み上げを見る位置:機械からの方位(rad、0 = +z 側)・仰角・距離の倍率 */
  watchAzimuth: 0.62,
  watchDrift: 0.38,
  watchElevation: 0.5,
  watchDistance: 3.5,
  watchMinDistance: 0.85,
  watchMaxDistance: 2.4,
  watchFov: 40,
  /** 追うときの機械からのずれ(紙の縮尺の機械に対して、m) */
  chase: [0.3, 0.38, 1.25] as V3,
  chaseFov: 46,
  /** 区間(u) */
  toWatch: [0, 0.18],
  drift: [0.05, 0.55],
  toFollow: [0.5, 0.64],
  toChase: [0.56, 0.72],
  toTrack: [0.78, 1],
} as const;

export interface CameraScratch {
  crane: CraneScratch;
  body: BodyPose;
  center: V3;
  tmp: V3;
  off: V3;
  watch: CameraPose;
  follow: CameraPose;
  mix: CameraPose;
}

const pose = (): CameraPose => ({
  position: [0, 0, 0],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fov: 45,
  ortho: 0,
});

export function createCameraScratch(): CameraScratch {
  return {
    crane: createCraneScratch(),
    body: createBodyPose(),
    center: [0, 0, 0],
    tmp: [0, 0, 0],
    off: [0, 0, 0],
    watch: pose(),
    follow: pose(),
    mix: pose(),
  };
}

/** a ← a + (b − a)·t(位置・注視点・上方向・画角・平行投影)。上方向は正規化する */
export function blendPose(a: CameraPose, b: CameraPose, t: number, out: CameraPose): CameraPose {
  for (let k = 0; k < 3; k++) {
    out.position[k] = a.position[k]! + (b.position[k]! - a.position[k]!) * t;
    out.target[k] = a.target[k]! + (b.target[k]! - a.target[k]!) * t;
    out.up[k] = a.up[k]! + (b.up[k]! - a.up[k]!) * t;
  }
  const l = Math.hypot(out.up[0], out.up[1], out.up[2]);
  if (l > 1e-9) {
    out.up[0] /= l;
    out.up[1] /= l;
    out.up[2] /= l;
  } else {
    out.up[0] = 0;
    out.up[1] = 1;
    out.up[2] = 0;
  }
  out.fov = a.fov + (b.fov - a.fov) * t;
  out.ortho = a.ortho + (b.ortho - a.ortho) * t;
  return out;
}

function setLook(p: CameraPose, target: V3, offset: V3, fov: number) {
  p.target[0] = target[0];
  p.target[1] = target[1];
  p.target[2] = target[2];
  p.position[0] = target[0] + offset[0];
  p.position[1] = target[1] + offset[1];
  p.position[2] = target[2] + offset[2];
  p.up[0] = 0;
  p.up[1] = 1;
  p.up[2] = 0;
  p.fov = fov;
  p.ortho = 0;
}

/**
 * 組み上げ・分解のカメラ。u は組み上がり具合(0 = 図面、1 = コース)。
 * design は設計画面の定位置、track は試走(結果)の定位置(どちらも今のフレームで求めたもの)。
 */
export function assemblyCamera(
  u: number,
  design: CameraPose,
  track: CameraPose,
  crane: CraneInput,
  sc: CameraScratch,
  out: CameraPose,
): CameraPose {
  const s0 = paperScale(crane.paper);
  const frame = crane.frame;
  // 組み上げを見る:紙の上の機械の中心を、斜め前から少しずつ回り込みながら
  bodyPoseAt(Math.min(u, ASSEMBLY_PHASES.carry.start), crane, sc.crane, sc.body);
  bodyCenter(sc.body, frame, sc.tmp, sc.center);
  const dist = Math.min(
    CAM.watchMaxDistance,
    Math.max(CAM.watchMinDistance, CAM.watchDistance * s0 * frame.radius),
  );
  const az = CAM.watchAzimuth + CAM.watchDrift * smoothstep(CAM.drift[0], CAM.drift[1], u);
  const ce = Math.cos(CAM.watchElevation);
  const off = sc.off;
  off[0] = Math.sin(az) * ce * dist;
  off[1] = Math.sin(CAM.watchElevation) * dist;
  off[2] = Math.cos(az) * ce * dist;
  setLook(sc.watch, sc.center, off, CAM.watchFov);

  copyPose(design, out);
  blendPose(out, sc.watch, smoothstep(CAM.toWatch[0], CAM.toWatch[1], u), out);
  const wf = smoothstep(CAM.toFollow[0], CAM.toFollow[1], u);
  if (wf > 0) {
    // 吊られた機械を追う:最初は見ていたときのずれのまま、だんだん後ろ上へ
    bodyPoseAt(u, crane, sc.crane, sc.body);
    bodyCenter(sc.body, frame, sc.tmp, sc.center);
    const k = sc.body.scale / s0;
    const wc = smoothstep(CAM.toChase[0], CAM.toChase[1], u);
    for (let i = 0; i < 3; i++) {
      const watchOff = sc.watch.position[i]! - sc.watch.target[i]!;
      off[i] = watchOff + (CAM.chase[i]! * k - watchOff) * wc;
    }
    setLook(sc.follow, sc.center, off, CAM.watchFov + (CAM.chaseFov - CAM.watchFov) * wc);
    blendPose(out, sc.follow, wf, out);
  }
  const wt = smoothstep(CAM.toTrack[0], CAM.toTrack[1], u);
  // 定位置へは機械の周りを回って移る(結果の定位置は機械の向こう側にあり、まっすぐ動くと機械を突き抜ける)
  if (wt > 0) orbitBlend(out, track, wt, sc.center, out);
  return out;
}

/**
 * a → b を点 c の周りの円柱座標(方位・水平距離・高さ)で補間する。方位は近い向きに回る。
 * 注視点・上方向・画角・平行投影は線形。t = 1 で b に一致する。
 */
export function orbitBlend(
  a: CameraPose,
  b: CameraPose,
  t: number,
  c: V3,
  out: CameraPose,
): CameraPose {
  const ax = a.position[0] - c[0];
  const az = a.position[2] - c[2];
  const bx = b.position[0] - c[0];
  const bz = b.position[2] - c[2];
  const angA = Math.atan2(ax, az);
  const ang = angA + wrapAngle(Math.atan2(bx, bz) - angA) * t;
  const rA = Math.hypot(ax, az);
  const r = rA + (Math.hypot(bx, bz) - rA) * t;
  const y = a.position[1] + (b.position[1] - a.position[1]) * t;
  blendPose(a, b, t, out);
  out.position[0] = c[0] + Math.sin(ang) * r;
  out.position[1] = y;
  out.position[2] = c[2] + Math.cos(ang) * r;
  return out;
}

/**
 * 試走 → 結果(T-04):機械の周りを半周する。中心は行き先の注視点(機械に付いて動く)。
 * t は遷移の進み具合(0..1)。t = 0 で start、t = 1 で end にぴったり一致する。
 */
export function goalCamera(
  t: number,
  start: CameraPose,
  end: CameraPose,
  out: CameraPose,
): CameraPose {
  const cx = end.target[0];
  const cz = end.target[2];
  const a0 = Math.atan2(start.position[0] - cx, start.position[2] - cz);
  const a1 = Math.atan2(end.position[0] - cx, end.position[2] - cz);
  const r0 = Math.hypot(start.position[0] - cx, start.position[2] - cz);
  const r1 = Math.hypot(end.position[0] - cx, end.position[2] - cz);
  let da = wrapAngle(a1 - a0);
  // ちょうど反対側なら、既定の経路と同じ向き(反時計回り)に回る
  if (da < -0.95 * Math.PI) da += 2 * Math.PI;
  const e = t <= 0 ? 0 : t >= 1 ? 1 : easeInOut(t);
  const a = a0 + da * e;
  const r = r0 + (r1 - r0) * e;
  out.position[0] = cx + Math.sin(a) * r;
  out.position[1] = start.position[1] + (end.position[1] - start.position[1]) * e;
  out.position[2] = cz + Math.cos(a) * r;
  const et = smoothstep(0, 0.55, t);
  for (let k = 0; k < 3; k++) {
    out.target[k] = start.target[k]! + (end.target[k]! - start.target[k]!) * et;
    out.up[k] = start.up[k]! + (end.up[k]! - start.up[k]!) * e;
  }
  const l = Math.hypot(out.up[0], out.up[1], out.up[2]) || 1;
  out.up[0] /= l;
  out.up[1] /= l;
  out.up[2] /= l;
  out.fov = start.fov + (end.fov - start.fov) * e;
  out.ortho = start.ortho + (end.ortho - start.ortho) * e;
  return out;
}

/**
 * 途中から始まった演出のつなぎ:カメラが演出の姿勢(fx)からずれた所にいたら(割り込み)、
 * そのずれ(start − fxAtStart)を w が 0 → 1 の間に消していく。ずれがなければ何もしない。
 */
export function decayOffset(
  fx: CameraPose,
  start: CameraPose,
  fxAtStart: CameraPose,
  w: number,
  out: CameraPose,
): CameraPose {
  const k = 1 - (w <= 0 ? 0 : w >= 1 ? 1 : w * w * (3 - 2 * w));
  for (let i = 0; i < 3; i++) {
    out.position[i] = fx.position[i]! + (start.position[i]! - fxAtStart.position[i]!) * k;
    out.target[i] = fx.target[i]! + (start.target[i]! - fxAtStart.target[i]!) * k;
    out.up[i] = fx.up[i]! + (start.up[i]! - fxAtStart.up[i]!) * k;
  }
  const l = Math.hypot(out.up[0], out.up[1], out.up[2]) || 1;
  out.up[0] /= l;
  out.up[1] /= l;
  out.up[2] /= l;
  out.fov = fx.fov + (start.fov - fxAtStart.fov) * k;
  out.ortho = Math.min(1, Math.max(0, fx.ortho + (start.ortho - fxAtStart.ortho) * k));
  return out;
}
