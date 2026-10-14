import { CM } from '@/core/model/types';
import { machineRadius, type MachineLayout } from '@/testrun/layout';
import { PAPER_DESIGN, PAPER_WORLD, TEST_TRACK, WINDOW, WINDOW_CENTER } from '../layout';
import { centripetalCatmullRom, type V3 } from '../rig/pose';
import { designToWorld } from '../rig/paper';
import { ASSEMBLY_PHASES, easeInOut, easeOutCubic, smoothstep, spanProgress } from './timeline';

/**
 * 機械の運び方(純粋な計算):製図用紙の上で組み上がった機械を、クレーンのフックで吊り上げ、
 * 窓を抜けて試走コースのスタートまで運んで降ろす。三角関数と配列だけで、毎フレームの割り当てはない。
 *
 * 機体の姿勢 = フックの位置 − 縮尺 × 回転 × 吊り点(機体ローカル)。
 * 縮尺は紙の上の図面の縮尺(m / 設計 cm を CM で割った値)から、窓を出たあとで実寸(1)まで大きくなる。
 */

export type Q4 = [number, number, number, number];

/** 製図用紙の上の設計座標(cm)とワールドの対応。紙の +x = 設計 +x、紙の −z = 設計 +y */
export interface PaperMapping {
  /** 設計の原点 (0, 0) の紙の上のワールド座標 */
  origin: V3;
  /** 1 cm あたりのワールド長(m) */
  metersPerCm: number;
}

/** 既定:紙 = PAPER_DESIGN の範囲(設計画面の初期の対応、`designToWorld` と同じ) */
export function defaultPaperMapping(): PaperMapping {
  const o = designToWorld(0, 0);
  return {
    origin: [o[0], o[1], o[2]],
    metersPerCm: PAPER_WORLD.width / (PAPER_DESIGN.xMax - PAPER_DESIGN.xMin),
  };
}

/** 機体の寸法(機体ローカル、実寸の m) */
export interface MachineFrame {
  /** 図面が立ち上がるときの蝶番の高さ:設計姿勢で最も低い点の y */
  hingeY: number;
  /** フックを掛ける点(機体の上、モーター軸の真上) */
  attach: V3;
  /** 外接箱の中心 */
  center: V3;
  /** 外接箱の対角の半分 */
  radius: number;
  /** 外接箱の高さ */
  height: number;
}

/** 機体の寸法を部品配置(試走の描画と同じもの)から求める */
export function machineFrame(layout: MachineLayout, designPosCm: ArrayLike<number>): MachineFrame {
  const e = layout.extent;
  let hingeY = Infinity;
  for (let j = 1; j < designPosCm.length; j += 2) hingeY = Math.min(hingeY, designPosCm[j]! * CM);
  if (!Number.isFinite(hingeY)) hingeY = e.yMin;
  const height = Math.max(0.05, e.yMax - e.yMin);
  const m = layout.motorJoint;
  const ax = m >= 0 ? designPosCm[m * 2]! * CM : (e.xMin + e.xMax) / 2;
  return {
    hingeY,
    attach: [ax, e.yMax + 0.18 * height, 0],
    center: [(e.xMin + e.xMax) / 2, (e.yMin + e.yMax) / 2, (e.zMin + e.zMax) / 2],
    radius: machineRadius(layout),
    height,
  };
}

export interface CraneInput {
  paper: PaperMapping;
  frame: MachineFrame;
  /** 紙の上で脚が紙にめり込まないよう持ち上げる量(機体ローカルの m) */
  paperLift: number;
  /** 着地点の機体の姿勢(ワールド、縮尺 1)。試走の最初のスナップショット */
  trackPosition: V3;
  trackQuaternion: Q4;
}

export interface BodyPose {
  position: V3;
  quaternion: Q4;
  scale: number;
}

export function createBodyPose(): BodyPose {
  return { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: 1 };
}

/** 着地点のふつうの置き場所(簡易:統合前の既定)。機体の原点を置く x・z と地面の高さ */
export const TRACK_LANDING = {
  x: TEST_TRACK.xStart + 1.5,
  z: TEST_TRACK.z,
  /** コースの板の上面 */
  groundY: 0.03,
} as const;

/** 紙の上の縮尺(機体ローカルの 1 m → ワールドの m) */
export function paperScale(paper: PaperMapping): number {
  return paper.metersPerCm / CM;
}

/**
 * 紙の上で立ち上がった機体の原点(ワールド)。設計姿勢で最も低い点(hingeY)が紙の上に乗り、
 * 脚が図面の線の位置から立ち上がる。
 */
export function paperBodyPosition(paper: PaperMapping, hingeY: number, lift: number, out: V3): V3 {
  const s = paperScale(paper);
  out[0] = paper.origin[0];
  out[1] = paper.origin[1] - s * hingeY + s * lift;
  out[2] = paper.origin[2] - s * hingeY;
  return out;
}

/** 運んでいる間の縮尺 */
export function machineScaleAt(u: number, paper: PaperMapping): number {
  const s0 = paperScale(paper);
  return s0 + (1 - s0) * smoothstep(0, 1, spanProgress(u, ASSEMBLY_PHASES.grow));
}

/** q ⊗ v(v を回す) */
export function rotate(q: Q4, v: V3, out: V3): V3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out[0] = vx + qw * tx + (qy * tz - qz * ty);
  out[1] = vy + qw * ty + (qz * tx - qx * tz);
  out[2] = vz + qw * tz + (qx * ty - qy * tx);
  return out;
}

/** 正規化線形補間(短い側) */
export function nlerpQ(a: Q4, b: Q4, t: number, out: Q4): Q4 {
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  let l = 0;
  for (let i = 0; i < 4; i++) {
    out[i] = a[i]! + (sign * b[i]! - a[i]!) * t;
    l += out[i]! * out[i]!;
  }
  l = Math.sqrt(l) || 1;
  for (let i = 0; i < 4; i++) out[i] = out[i]! / l;
  return out;
}

/** a ⊗ b */
export function mulQ(a: Q4, b: Q4, out: Q4): Q4 {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

const IDENTITY: Q4 = [0, 0, 0, 1];

/** 経路の点(フックの位置):紙の上 → 持ち上げ → 窓の内 → 窓の外 → 着地点の上 */
export const ROUTE_POINTS = 5;

/** 窓を通るときの、フックの高さの上限(窓の上の枠の少し下) */
const WINDOW_HOOK_MAX = WINDOW.yMax - 0.12;

/**
 * フックの経路の経由点を書く(out は ROUTE_POINTS 個の V3)。着地点(H5)は landing に書く。
 * 窓を通る区間は、機械の中心が窓の中心の高さに来るようにする(大きな機械では上限で抑える)。
 */
export function routePoints(input: CraneInput, out: V3[], landing: V3, scratch: V3): void {
  const { paper, frame } = input;
  const s0 = paperScale(paper);
  const H0 = out[0]!;
  paperBodyPosition(paper, frame.hingeY, input.paperLift, H0);
  H0[0] += s0 * frame.attach[0];
  H0[1] += s0 * frame.attach[1];
  H0[2] += s0 * frame.attach[2];
  const hangY = Math.min(
    WINDOW_HOOK_MAX,
    WINDOW_CENTER[1] + s0 * (frame.attach[1] - frame.center[1]),
  );
  const H1 = out[1]!;
  H1[0] = H0[0];
  H1[1] = Math.max(H0[1] + 0.12, hangY);
  H1[2] = H0[2];
  const H2 = out[2]!;
  H2[0] = WINDOW_CENTER[0];
  H2[1] = hangY;
  H2[2] = WINDOW.z + 0.55;
  const H3 = out[3]!;
  H3[0] = WINDOW_CENTER[0];
  H3[1] = hangY;
  H3[2] = WINDOW.z - 0.9;
  // 着地点の吊り点
  rotate(input.trackQuaternion, frame.attach, scratch);
  landing[0] = input.trackPosition[0] + scratch[0];
  landing[1] = input.trackPosition[1] + scratch[1];
  landing[2] = input.trackPosition[2] + scratch[2];
  const H4 = out[4]!;
  H4[0] = landing[0];
  H4[1] = landing[1] + Math.max(1.0, frame.height * 1.1);
  H4[2] = landing[2];
}

function d(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** 経由点を通る滑らかな曲線(区間の重みは弦の長さ)。u ∈ [0,1] */
export function evalRoute(points: readonly V3[], u: number, out: V3): V3 {
  const n = points.length;
  if (n === 0) return out;
  if (n === 1 || u <= 0) {
    const p = points[0]!;
    out[0] = p[0];
    out[1] = p[1];
    out[2] = p[2];
    return out;
  }
  let total = 0;
  for (let i = 0; i + 1 < n; i++) total += d(points[i]!, points[i + 1]!) + 1e-6;
  let acc = 0;
  let seg = n - 2;
  let t = 1;
  const target = Math.min(1, u) * total;
  for (let i = 0; i + 1 < n; i++) {
    const len = d(points[i]!, points[i + 1]!) + 1e-6;
    if (target <= acc + len || i === n - 2) {
      seg = i;
      t = Math.min(1, Math.max(0, (target - acc) / len));
      break;
    }
    acc += len;
  }
  const p1 = points[seg]!;
  const p2 = points[seg + 1]!;
  const p0 = seg > 0 ? points[seg - 1]! : null;
  const p3 = seg + 2 < n ? points[seg + 2]! : null;
  for (let k = 0; k < 3; k++) {
    const a1 = p1[k]!;
    const a2 = p2[k]!;
    // 端点の外側は鏡映で補う
    const a0 = p0 ? p0[k]! : 2 * a1 - a2;
    const a3 = p3 ? p3[k]! : 2 * a2 - a1;
    const d01 = p0 ? d(p0, p1) : d(p1, p2);
    const d12 = d(p1, p2);
    const d23 = p3 ? d(p2, p3) : d(p1, p2);
    out[k] = centripetalCatmullRom(a0, a1, a2, a3, d01, d12, d23, t);
  }
  return out;
}

/** 運ぶ途中の揺れの大きさ(rad) */
export const SWAY = { carry: 0.14, landing: 0.05 } as const;

/** 揺れ(振り子):運び始めは後ろへ遅れ、止まるときは前へ振れ、降ろすときに小さく揺れて止まる */
export function swayAngle(u: number): number {
  const P = ASSEMBLY_PHASES;
  const c = spanProgress(u, P.carry);
  if (c > 0 && c < 1) return SWAY.carry * Math.sin(2 * Math.PI * c) * Math.sin(Math.PI * c);
  const l = spanProgress(u, P.lower);
  if (l > 0 && l < 1) return -SWAY.landing * Math.sin(3 * Math.PI * l) * (1 - l);
  return 0;
}

/** 作業用(割り当てを避ける) */
export interface CraneScratch {
  points: V3[];
  landing: V3;
  tmp: V3;
  tmp2: V3;
  q: Q4;
  qs: Q4;
}

export function createCraneScratch(): CraneScratch {
  return {
    points: Array.from({ length: ROUTE_POINTS }, (): V3 => [0, 0, 0]),
    landing: [0, 0, 0],
    tmp: [0, 0, 0],
    tmp2: [0, 0, 0],
    q: [0, 0, 0, 1],
    qs: [0, 0, 0, 1],
  };
}

/** u のときのフックの位置(ワールド)。運ぶ前は紙の上の吊り点、着地後は着地点の吊り点 */
export function hookPointAt(u: number, input: CraneInput, sc: CraneScratch, out: V3): V3 {
  const P = ASSEMBLY_PHASES;
  routePoints(input, sc.points, sc.landing, sc.tmp);
  if (u <= P.carry.start) {
    const p = sc.points[0]!;
    out[0] = p[0];
    out[1] = p[1];
    out[2] = p[2];
    return out;
  }
  if (u < P.carry.end) return evalRoute(sc.points, easeInOut(spanProgress(u, P.carry)), out);
  const H4 = sc.points[ROUTE_POINTS - 1]!;
  const e = easeOutCubic(spanProgress(u, P.lower));
  out[0] = H4[0] + (sc.landing[0] - H4[0]) * e;
  out[1] = H4[1] + (sc.landing[1] - H4[1]) * e;
  out[2] = H4[2] + (sc.landing[2] - H4[2]) * e;
  return out;
}

/**
 * u のときの機体の姿勢(ワールド)。組み上げ中(運ぶ前)は紙の上で立っている姿勢、
 * 着地後は trackPosition / trackQuaternion にぴったり一致する。
 */
export function bodyPoseAt(
  u: number,
  input: CraneInput,
  sc: CraneScratch,
  out: BodyPose,
  hook: V3 = sc.tmp2,
): BodyPose {
  const P = ASSEMBLY_PHASES;
  const s = machineScaleAt(u, input.paper);
  out.scale = s;
  // 向き:降ろしながら試走の機体の向きへ
  nlerpQ(IDENTITY, input.trackQuaternion, smoothstep(0, 1, spanProgress(u, P.live)), sc.q);
  // 揺れ:進む向きに垂直な水平軸の回り
  const a = swayAngle(u);
  if (a !== 0) {
    const pts = sc.points;
    routePoints(input, pts, sc.landing, sc.tmp);
    const dx = pts[4]![0] - pts[1]![0];
    const dz = pts[4]![2] - pts[1]![2];
    const l = Math.hypot(dx, dz) || 1;
    // 軸 = 上 × 進む向き
    const ax = dz / l;
    const az = -dx / l;
    const h = Math.sin(a / 2);
    sc.qs[0] = ax * h;
    sc.qs[1] = 0;
    sc.qs[2] = az * h;
    sc.qs[3] = Math.cos(a / 2);
    mulQ(sc.qs, sc.q, out.quaternion);
  } else {
    out.quaternion[0] = sc.q[0];
    out.quaternion[1] = sc.q[1];
    out.quaternion[2] = sc.q[2];
    out.quaternion[3] = sc.q[3];
  }
  hookPointAt(u, input, sc, hook);
  rotate(out.quaternion, input.frame.attach, sc.tmp);
  out.position[0] = hook[0] - s * sc.tmp[0];
  out.position[1] = hook[1] - s * sc.tmp[1];
  out.position[2] = hook[2] - s * sc.tmp[2];
  return out;
}

/** 機体の中心(ワールド)。カメラが追う点 */
export function bodyCenter(pose: BodyPose, frame: MachineFrame, tmp: V3, out: V3): V3 {
  rotate(pose.quaternion, frame.center, tmp);
  out[0] = pose.position[0] + pose.scale * tmp[0];
  out[1] = pose.position[1] + pose.scale * tmp[1];
  out[2] = pose.position[2] + pose.scale * tmp[2];
  return out;
}
