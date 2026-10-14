import type { TerrainShape, TerrainSpec } from '@/core/sim/types';

/**
 * TerrainSpec の純粋な幾何(描画・カメラ・プレビュー用の簡易シミュレーションで共有)。
 * three には依存しない。単位は m。
 */

/** (x, z) の真上から見た地形の上面の高さ。何もなければ -Infinity */
export function terrainHeightAt(spec: TerrainSpec, x: number, z: number): number {
  let h = spec.ground ? spec.ground.y : -Infinity;
  for (const s of spec.shapes) {
    const top = shapeTopAt(s, x, z);
    if (top > h) h = top;
  }
  return h;
}

/** 1 つの形の (x, z) での上面の高さ。範囲外は -Infinity */
export function shapeTopAt(s: TerrainShape, x: number, z: number): number {
  if (s.kind === 'box') {
    if (x < s.min[0] || x > s.max[0] || z < s.min[2] || z > s.max[2]) return -Infinity;
    return s.max[1];
  }
  const xa = Math.min(s.x0, s.x1);
  const xb = Math.max(s.x0, s.x1);
  if (x < xa || x > xb || z < Math.min(s.z0, s.z1) || z > Math.max(s.z0, s.z1)) return -Infinity;
  const span = s.x1 - s.x0;
  const u = Math.abs(span) < 1e-12 ? 1 : (x - s.x0) / span;
  return s.y0 + (s.y1 - s.y0) * u;
}

export interface CourseBounds {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  /** 形の底と上面の範囲 */
  yMin: number;
  yMax: number;
}

/**
 * コースの範囲。形があればその外接箱、地面だけなら [fallbackX] の区間と z ±fallbackHalfWidth。
 * start と goal を含むように広げる。
 */
export function courseBounds(
  spec: TerrainSpec,
  extra: { start?: { x: number }; goal?: { x: number } } = {},
  fallbackHalfWidth = 0.8,
): CourseBounds {
  let xMin = Infinity;
  let xMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of spec.shapes) {
    if (s.kind === 'box') {
      xMin = Math.min(xMin, s.min[0]);
      xMax = Math.max(xMax, s.max[0]);
      zMin = Math.min(zMin, s.min[2]);
      zMax = Math.max(zMax, s.max[2]);
      yMin = Math.min(yMin, s.min[1]);
      yMax = Math.max(yMax, s.max[1]);
    } else {
      xMin = Math.min(xMin, s.x0, s.x1);
      xMax = Math.max(xMax, s.x0, s.x1);
      zMin = Math.min(zMin, s.z0, s.z1);
      zMax = Math.max(zMax, s.z0, s.z1);
      yMin = Math.min(yMin, s.bottom);
      yMax = Math.max(yMax, s.y0, s.y1);
    }
  }
  if (spec.ground) {
    yMin = Math.min(yMin, spec.ground.y);
    yMax = Math.max(yMax, spec.ground.y);
  }
  if (!Number.isFinite(xMin)) {
    xMin = -1;
    xMax = 10;
  }
  for (const p of [extra.start, extra.goal]) {
    if (!p) continue;
    xMin = Math.min(xMin, p.x);
    xMax = Math.max(xMax, p.x);
  }
  if (!Number.isFinite(zMin)) {
    zMin = -fallbackHalfWidth;
    zMax = fallbackHalfWidth;
  }
  if (!Number.isFinite(yMin)) {
    yMin = 0;
    yMax = 0;
  }
  return { xMin, xMax, zMin, zMax, yMin, yMax };
}

/** from から to までの step 刻みの目盛り位置(両端を含む整数倍のみ) */
export function distanceTicks(from: number, to: number, step = 1): number[] {
  if (!(step > 0) || !Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const out: number[] = [];
  const first = Math.ceil(from / step - 1e-9);
  const last = Math.floor(to / step + 1e-9);
  for (let k = first; k <= last && out.length < 10000; k++) {
    // `+ 0` で -0 を 0 にそろえる
    out.push(Math.round(k * step * 1e9) / 1e9 + 0);
  }
  return out;
}

/**
 * 形をまとめた三角形メッシュ(非インデックス)。法線は面ごと、UV はワールド座標(m)。
 * 上面は (x, z)、側面は (x または z, y) を UV にするので、1 枚のタイル模様が全形状でそろう。
 */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
}

type V3 = [number, number, number];

class MeshBuilder {
  p: number[] = [];
  n: number[] = [];
  uv: number[] = [];
  /** 四角形 a-b-c-d(反時計回りで外向き)を 2 枚の三角形にする */
  quad(a: V3, b: V3, c: V3, d: V3, uvAxis: 'xz' | 'xy' | 'zy') {
    const nrm = faceNormal(a, b, c);
    for (const v of [a, b, c, a, c, d]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(nrm[0], nrm[1], nrm[2]);
      if (uvAxis === 'xz') this.uv.push(v[0], v[2]);
      else if (uvAxis === 'xy') this.uv.push(v[0], v[1]);
      else this.uv.push(v[2], v[1]);
    }
  }
  build(): MeshData {
    return {
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      uvs: new Float32Array(this.uv),
    };
  }
}

function faceNormal(a: V3, b: V3, c: V3): V3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

/** 直方体と坂を 1 つのメッシュにまとめる(静的なので 1 回だけ作る) */
export function buildTerrainMesh(shapes: readonly TerrainShape[]): MeshData {
  const m = new MeshBuilder();
  for (const s of shapes) {
    if (s.kind === 'box') {
      const [x0, y0, z0] = s.min;
      const [x1, y1, z1] = s.max;
      // 上面・底面
      m.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 'xz');
      m.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 'xz');
      // 前後(±x)
      m.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 'zy');
      m.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 'zy');
      // 左右(±z)
      m.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 'xy');
      m.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 'xy');
    } else {
      // x0 < x1 になるよう並べ替える(上面の高さも入れ替え)
      const flip = s.x1 < s.x0;
      const xa = flip ? s.x1 : s.x0;
      const xb = flip ? s.x0 : s.x1;
      const ya = flip ? s.y1 : s.y0;
      const yb = flip ? s.y0 : s.y1;
      const za = Math.min(s.z0, s.z1);
      const zb = Math.max(s.z0, s.z1);
      const b = s.bottom;
      m.quad([xa, ya, zb], [xb, yb, zb], [xb, yb, za], [xa, ya, za], 'xz');
      m.quad([xa, b, za], [xb, b, za], [xb, b, zb], [xa, b, zb], 'xz');
      m.quad([xb, b, zb], [xb, b, za], [xb, yb, za], [xb, yb, zb], 'zy');
      m.quad([xa, b, za], [xa, b, zb], [xa, ya, zb], [xa, ya, za], 'zy');
      m.quad([xa, b, zb], [xb, b, zb], [xb, yb, zb], [xa, ya, zb], 'xy');
      m.quad([xb, b, za], [xa, b, za], [xa, ya, za], [xb, yb, za], 'xy');
    }
  }
  return m.build();
}
