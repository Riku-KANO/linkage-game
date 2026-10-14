/**
 * カメラの姿勢と、その補間(純粋な数学。three・React に依存しない)。
 *
 * 姿勢 = 位置・注視点・上方向・画角・平行投影の度合い(0 = 透視、1 = 平行)。
 * 経路は姿勢の列で、位置と注視点は求心型 Catmull-Rom で全ての経由点を通る滑らかな曲線にする。
 * 上方向・画角・平行投影の度合いは区間ごとの線形補間。
 */

export type V3 = [number, number, number];

export interface CameraPose {
  position: V3;
  target: V3;
  /** 画面の上方向(ワールド)。視線と平行でなければよい(正規化は適用時に行う) */
  up: V3;
  /** 縦の画角(度)。平行投影では注視点での見える高さ = 2·距離·tan(fov/2) */
  fov: number;
  /** 0 = 透視投影、1 = 平行投影 */
  ortho: number;
}

export function createPose(p?: Partial<CameraPose>): CameraPose {
  return {
    position: p?.position ? [...p.position] : [0, 0, 5],
    target: p?.target ? [...p.target] : [0, 0, 0],
    up: p?.up ? [...p.up] : [0, 1, 0],
    fov: p?.fov ?? 45,
    ortho: p?.ortho ?? 0,
  };
}

export function copyPose(src: CameraPose, out: CameraPose = createPose()): CameraPose {
  out.position[0] = src.position[0];
  out.position[1] = src.position[1];
  out.position[2] = src.position[2];
  out.target[0] = src.target[0];
  out.target[1] = src.target[1];
  out.target[2] = src.target[2];
  out.up[0] = src.up[0];
  out.up[1] = src.up[1];
  out.up[2] = src.up[2];
  out.fov = src.fov;
  out.ortho = src.ortho;
  return out;
}

export function clonePose(src: CameraPose): CameraPose {
  return copyPose(src, createPose());
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpV3(a: V3, b: V3, t: number, out: V3): V3 {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
  return out;
}

function dist(a: V3, b: V3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** 2 つの姿勢の線形補間(位置・注視点は直線、上方向は線形補間して正規化) */
export function lerpPose(a: CameraPose, b: CameraPose, t: number, out: CameraPose): CameraPose {
  lerpV3(a.position, b.position, t, out.position);
  lerpV3(a.target, b.target, t, out.target);
  lerpV3(a.up, b.up, t, out.up);
  normalizeInPlace(out.up);
  out.fov = lerp(a.fov, b.fov, t);
  out.ortho = lerp(a.ortho, b.ortho, t);
  return out;
}

function normalizeInPlace(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l > 1e-12) {
    v[0] /= l;
    v[1] /= l;
    v[2] /= l;
  } else {
    v[0] = 0;
    v[1] = 1;
    v[2] = 0;
  }
  return v;
}

/**
 * 求心型 Catmull-Rom(α = 0.5)。p1 → p2 の区間を t ∈ [0,1] で評価する。
 * カスプやループが出にくく、経由点の間隔が不揃いでも暴れない。
 */
export function centripetalCatmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  d01: number,
  d12: number,
  d23: number,
  t: number,
): number {
  const EPS = 1e-4;
  const t0 = 0;
  const t1 = t0 + Math.max(Math.sqrt(d01), EPS);
  const t2 = t1 + Math.max(Math.sqrt(d12), EPS);
  const t3 = t2 + Math.max(Math.sqrt(d23), EPS);
  const tt = t1 + (t2 - t1) * t;
  const a1 = ((t1 - tt) / (t1 - t0)) * p0 + ((tt - t0) / (t1 - t0)) * p1;
  const a2 = ((t2 - tt) / (t2 - t1)) * p1 + ((tt - t1) / (t2 - t1)) * p2;
  const a3 = ((t3 - tt) / (t3 - t2)) * p2 + ((tt - t2) / (t3 - t2)) * p3;
  const b1 = ((t2 - tt) / (t2 - t0)) * a1 + ((tt - t0) / (t2 - t0)) * a2;
  const b2 = ((t3 - tt) / (t3 - t1)) * a2 + ((tt - t1) / (t3 - t1)) * a3;
  return ((t2 - tt) / (t2 - t1)) * b1 + ((tt - t1) / (t2 - t1)) * b2;
}

/**
 * 姿勢の列をなぞるカメラ経路。最後の点(行き先の定位置)は毎フレーム差し替えられる
 * (画面サイズの変化や動く被写体に追従するため)。
 */
export class CameraPath {
  readonly points: CameraPose[];
  /** 区間ごとの重み(累積、末尾が 1) */
  private cumulative: number[];
  private readonly tmpA: V3 = [0, 0, 0];
  private readonly tmpB: V3 = [0, 0, 0];

  constructor(points: CameraPose[]) {
    if (points.length === 0) throw new Error('CameraPath: empty');
    this.points = points.map(clonePose);
    this.cumulative = [];
    this.recomputeWeights();
  }

  /** 区間の長さの目安:位置と注視点の移動量の和(回り込みが長い区間ほど時間を使う) */
  private recomputeWeights() {
    const pts = this.points;
    const w: number[] = [];
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const d =
        dist(a.position, b.position) +
        0.5 * dist(a.target, b.target) +
        0.2 * Math.abs(a.ortho - b.ortho) +
        1e-3;
      total += d;
      w.push(total);
    }
    this.cumulative = w.map((x) => x / (total || 1));
  }

  get end(): CameraPose {
    return this.points[this.points.length - 1]!;
  }

  /** 行き先の姿勢を差し替える(重みは作ったときのまま) */
  setEnd(pose: CameraPose) {
    copyPose(pose, this.end);
  }

  /** u ∈ [0,1] の姿勢。u は(イージング済みの)全体の進行度 */
  evaluate(u: number, out: CameraPose): CameraPose {
    const pts = this.points;
    const n = pts.length;
    if (n === 1 || u <= 0) return copyPose(pts[0]!, out);
    if (u >= 1) return copyPose(pts[n - 1]!, out);
    if (n === 2) return lerpPose(pts[0]!, pts[1]!, u, out);
    let seg = 0;
    while (seg < n - 2 && u > this.cumulative[seg]!) seg++;
    const u0 = seg === 0 ? 0 : this.cumulative[seg - 1]!;
    const u1 = this.cumulative[seg]!;
    const t = u1 > u0 ? (u - u0) / (u1 - u0) : 1;
    const a = pts[seg]!;
    const b = pts[seg + 1]!;
    this.spline('position', seg, t, out.position);
    this.spline('target', seg, t, out.target);
    lerpV3(a.up, b.up, t, out.up);
    normalizeInPlace(out.up);
    out.fov = lerp(a.fov, b.fov, t);
    out.ortho = lerp(a.ortho, b.ortho, t);
    return out;
  }

  private spline(key: 'position' | 'target', seg: number, t: number, out: V3) {
    const pts = this.points;
    const n = pts.length;
    const p1 = pts[seg]![key];
    const p2 = pts[seg + 1]![key];
    // 端点の外側は鏡映で補う
    const p0 = seg > 0 ? pts[seg - 1]![key] : reflect(p2, p1, this.tmpA);
    const p3 = seg + 2 < n ? pts[seg + 2]![key] : reflect(p1, p2, this.tmpB);
    const d01 = dist(p0, p1);
    const d12 = dist(p1, p2);
    const d23 = dist(p2, p3);
    for (let k = 0; k < 3; k++) {
      out[k] = centripetalCatmullRom(p0[k]!, p1[k]!, p2[k]!, p3[k]!, d01, d12, d23, t);
    }
  }
}

/** 2·b − a(a を b について鏡映) */
function reflect(a: V3, b: V3, out: V3): V3 {
  out[0] = 2 * b[0] - a[0];
  out[1] = 2 * b[1] - a[1];
  out[2] = 2 * b[2] - a[2];
  return out;
}

/** 2 つの姿勢の差の目安(m)。定位置に落ち着いているかの判定に使う */
export function poseDistance(a: CameraPose, b: CameraPose): number {
  return (
    dist(a.position, b.position) +
    dist(a.target, b.target) +
    Math.abs(a.fov - b.fov) * 0.01 +
    Math.abs(a.ortho - b.ortho)
  );
}
