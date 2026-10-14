import type { Ball, Collider } from '@dimforge/rapier3d-compat';
import type { TerrainCollider, TerrainContact, TerrainShape, TerrainSpec, Vec3 } from './types';
import { DEFAULT_FRICTION } from './constants';

/**
 * 地形の衝突判定(SIM-1)。
 *
 * - `createRapierTerrain`:本番用。地面(半空間)と box(直方体)は Rapier の固定コライダーにし、
 *   接触球との最近接(contactShape)で深さと法線を求める。Rapier は衝突判定だけに使い、
 *   ワールドを step しない(剛体・関節は使わない)。
 *   ramp(坂)は台形の断面を z 方向に伸ばした角柱として、JS の倍精度で厳密に解く。
 *   Rapier の凸包(float32 の GJK)は、球の中心が斜面から約 10µm 以内に来ると法線が乱れ、
 *   逆向きになることがある(めり込みが接触球の半径に達する重い機体で起こる)ため。
 * - `createFlatTerrain`:テスト用の解析的な平面。
 *
 * 複数の形に同時に触れたとき(段差の根元など)は、法線を深さで重み付けして足し合わせた
 * 向きを使い、深さは最大のものを使う(継ぎ目で力が 2 倍にならないように)。
 * 注意:同じ高さの box を隣り合わせると、継ぎ目の近くで深くめり込んだ点が側面の法線を拾う
 * (内部の辺の問題)。平らな区間は 1 つの box で作ること。
 */

/** 平面(y = 一定)の地形 */
export function createFlatTerrain(y = 0, friction = DEFAULT_FRICTION): TerrainCollider {
  return {
    friction,
    query(p: Vec3, r: number): TerrainContact | null {
      const depth = r - (p.y - y);
      if (depth <= 0) return null;
      return { depth, normal: { x: 0, y: 1, z: 0 } };
    },
    heightAt() {
      return y;
    },
  };
}

type RapierModule = (typeof import('@dimforge/rapier3d-compat'))['default'];
let RAPIER: RapierModule | null = null;
let ready: Promise<void> | null = null;
/**
 * Rapier(WASM)の読み込みと初期化。何度呼んでも 1 回だけ。
 * Rapier は約 1.7MB(gzip)あるので、静的に import せず試走の直前に読む(初回ロードを軽く保つ)。
 */
export function initRapier(): Promise<void> {
  ready ??= import('@dimforge/rapier3d-compat').then(async (m) => {
    await m.default.init();
    RAPIER = m.default;
  });
  return ready;
}

/**
 * 坂の角柱:xy の断面は反時計回りの凸多角形(台形)、z は [z0, z1]。
 * 上面は x0..x1 で top0 → top1 の直線。
 */
interface Prism {
  vx: number[];
  vy: number[];
  /** 辺 i(頂点 i → i+1)の外向き単位法線 */
  nx: number[];
  ny: number[];
  z0: number;
  z1: number;
  x0: number;
  x1: number;
  top0: number;
  top1: number;
}

type Entry =
  | { kind: 'rapier'; collider: Collider; min: number[]; max: number[] }
  | { kind: 'prism'; prism: Prism; min: number[]; max: number[] };

/** 坂の仕様から角柱を作る。幅や高さが 0 なら null */
export function rampPrism(s: Extract<TerrainShape, { kind: 'ramp' }>): Prism | null {
  let { x0, x1, y0, y1 } = s;
  if (x1 < x0) [x0, x1, y0, y1] = [x1, x0, y1, y0];
  const b = s.bottom;
  const top0 = Math.max(y0, b);
  const top1 = Math.max(y1, b);
  if (!(x1 - x0 > 1e-9) || !(Math.max(top0, top1) - b > 1e-9)) return null;
  // 反時計回り:左下 → 右下 → 右上 → 左上(長さ 0 の辺は省く)
  const px = [x0, x1, x1, x0];
  const py = [b, b, top1, top0];
  const vx: number[] = [];
  const vy: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 3) % 4;
    if (Math.hypot(px[i]! - px[j]!, py[i]! - py[j]!) > 1e-12) {
      vx.push(px[i]!);
      vy.push(py[i]!);
    }
  }
  const nx: number[] = [];
  const ny: number[] = [];
  for (let i = 0; i < vx.length; i++) {
    const k = (i + 1) % vx.length;
    const dx = vx[k]! - vx[i]!;
    const dy = vy[k]! - vy[i]!;
    const len = Math.hypot(dx, dy);
    nx.push(dy / len);
    ny.push(-dx / len);
  }
  return {
    vx,
    vy,
    nx,
    ny,
    z0: Math.min(s.z0, s.z1),
    z1: Math.max(s.z0, s.z1),
    x0,
    x1,
    top0,
    top1,
  };
}

/**
 * 点 p から角柱までの符号付き距離(外が正)と外向き法線(out に書く)。
 * 断面(多角形)と z 区間の直積なので、最近点はそれぞれの最近点の組になる。
 */
export function prismDistance(pr: Prism, p: Vec3, out: Vec3): number {
  const n = pr.vx.length;
  // 断面:各辺の直線までの距離の最大(内側なら負)
  let maxS = -Infinity;
  let arg = 0;
  for (let i = 0; i < n; i++) {
    const s = pr.nx[i]! * (p.x - pr.vx[i]!) + pr.ny[i]! * (p.y - pr.vy[i]!);
    if (s > maxS) {
      maxS = s;
      arg = i;
    }
  }
  let d2: number;
  let n2x: number;
  let n2y: number;
  if (maxS <= 0) {
    d2 = maxS;
    n2x = pr.nx[arg]!;
    n2y = pr.ny[arg]!;
  } else {
    // 外側:辺(線分)への最短距離
    let best = Infinity;
    let qx = 0;
    let qy = 0;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      const ax = pr.vx[i]!;
      const ay = pr.vy[i]!;
      const ex = pr.vx[k]! - ax;
      const ey = pr.vy[k]! - ay;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * ex + (p.y - ay) * ey) / (ex * ex + ey * ey)));
      const cx = ax + ex * t;
      const cy = ay + ey * t;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < best) {
        best = d;
        qx = cx;
        qy = cy;
      }
    }
    d2 = best;
    if (best > 1e-12) {
      n2x = (p.x - qx) / best;
      n2y = (p.y - qy) / best;
    } else {
      n2x = pr.nx[arg]!;
      n2y = pr.ny[arg]!;
    }
  }
  // z 区間
  const lo = pr.z0 - p.z;
  const hi = p.z - pr.z1;
  const sz = Math.max(lo, hi);
  const nz = lo > hi ? -1 : 1;
  if (d2 <= 0 && sz <= 0) {
    if (d2 >= sz) {
      out.x = n2x;
      out.y = n2y;
      out.z = 0;
      return d2;
    }
    out.x = 0;
    out.y = 0;
    out.z = nz;
    return sz;
  }
  const a = Math.max(d2, 0);
  const c = Math.max(sz, 0);
  const dist = Math.hypot(a, c);
  out.x = (n2x * a) / dist;
  out.y = (n2y * a) / dist;
  out.z = (nz * c) / dist;
  return dist;
}

/** 角柱の上面の高さの [xa, xb] での最大値(上面は直線なので端点のどちらか) */
function prismTopMax(pr: Prism, xa: number, xb: number): number {
  const at = (x: number) => {
    const c = Math.max(pr.x0, Math.min(pr.x1, x));
    return pr.top0 + ((pr.top1 - pr.top0) * (c - pr.x0)) / (pr.x1 - pr.x0);
  };
  return Math.max(at(xa), at(xb));
}

export async function createRapierTerrain(spec: TerrainSpec): Promise<TerrainCollider> {
  await initRapier();
  const R = RAPIER!;
  const world = new R.World({ x: 0, y: 0, z: 0 });
  const entries: Entry[] = [];

  if (spec.ground) {
    const gy = spec.ground.y;
    const desc = new R.ColliderDesc(new R.HalfSpace({ x: 0, y: 1, z: 0 }));
    desc.setTranslation(0, gy, 0);
    entries.push({
      kind: 'rapier',
      collider: world.createCollider(desc),
      min: [-Infinity, -Infinity, -Infinity],
      max: [Infinity, gy, Infinity],
    });
  }
  for (const s of spec.shapes) {
    if (s.kind === 'box') {
      const [x0, y0, z0] = s.min;
      const [x1, y1, z1] = s.max;
      const desc = R.ColliderDesc.cuboid(
        Math.abs(x1 - x0) / 2,
        Math.abs(y1 - y0) / 2,
        Math.abs(z1 - z0) / 2,
      ).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      entries.push({
        kind: 'rapier',
        collider: world.createCollider(desc),
        min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
        max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      });
    } else {
      const prism = rampPrism(s);
      if (!prism) continue; // 退化した坂(幅・高さ 0)は無視
      entries.push({
        kind: 'prism',
        prism,
        min: [prism.x0, s.bottom, prism.z0],
        max: [prism.x1, Math.max(prism.top0, prism.top1), prism.z1],
      });
    }
  }

  const balls = new Map<number, Ball>();
  const ball = (r: number) => {
    let b = balls.get(r);
    if (!b) {
      b = new R.Ball(r);
      balls.set(r, b);
    }
    return b;
  };
  const ROT = { x: 0, y: 0, z: 0, w: 1 };
  const pos = { x: 0, y: 0, z: 0 };
  const nrm: Vec3 = { x: 0, y: 0, z: 0 };
  const hit = new R.ShapeContact(
    0,
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  );

  let disposed = false;
  return {
    friction: spec.friction ?? DEFAULT_FRICTION,
    query(p: Vec3, r: number): TerrainContact | null {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      let maxDepth = 0;
      let bx = 0;
      let by = 0;
      let bz = 0;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!;
        if (
          p.x + r < e.min[0]! ||
          p.x - r > e.max[0]! ||
          p.y + r < e.min[1]! ||
          p.y - r > e.max[1]! ||
          p.z + r < e.min[2]! ||
          p.z - r > e.max[2]!
        )
          continue;
        let depth: number;
        if (e.kind === 'prism') {
          // 球の下端が [x−r, x+r] での上面の最高点より上なら触れない(傾いた面でも保守的)
          if (p.y - r > prismTopMax(e.prism, p.x - r, p.x + r) + 1e-9) continue;
          depth = r - prismDistance(e.prism, p, nrm);
        } else {
          pos.x = p.x;
          pos.y = p.y;
          pos.z = p.z;
          const c = e.collider.contactShape(ball(r), pos, ROT, 0, hit);
          if (!c) continue;
          depth = -c.distance;
          nrm.x = c.normal1.x;
          nrm.y = c.normal1.y;
          nrm.z = c.normal1.z;
        }
        if (!(depth > 0)) continue;
        sx += nrm.x * depth;
        sy += nrm.y * depth;
        sz += nrm.z * depth;
        if (depth > maxDepth) {
          maxDepth = depth;
          bx = nrm.x;
          by = nrm.y;
          bz = nrm.z;
        }
      }
      if (maxDepth <= 0) return null;
      const len = Math.hypot(sx, sy, sz);
      if (len < maxDepth * 1e-6) {
        // 向かい合う面に挟まれて打ち消し合った:最も深い接触を使う
        return { depth: maxDepth, normal: unit(bx, by, bz) };
      }
      return { depth: maxDepth, normal: { x: sx / len, y: sy / len, z: sz / len } };
    },
    heightAt(x: number, z: number): number {
      let best = -Infinity;
      let top = -Infinity;
      for (const e of entries) {
        if (x < e.min[0]! || x > e.max[0]! || z < e.min[2]! || z > e.max[2]!) continue;
        if (e.kind === 'prism') best = Math.max(best, prismTopMax(e.prism, x, x));
        else top = Math.max(top, e.max[1]!);
      }
      if (top === -Infinity) return best;
      // Rapier のコライダー:AABB の上端の少し上から真下へ光線を飛ばす(float32 の精度を保つため近くから)
      const oy = top + 1;
      const ray = new R.Ray({ x, y: oy, z }, { x: 0, y: -1, z: 0 });
      for (const e of entries) {
        if (e.kind !== 'rapier') continue;
        if (x < e.min[0]! || x > e.max[0]! || z < e.min[2]! || z > e.max[2]!) continue;
        const toi = e.collider.castRay(ray, 1e6, true);
        if (toi >= 0) best = Math.max(best, oy - toi);
      }
      return best;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      world.free();
    },
  };
}

function unit(x: number, y: number, z: number): Vec3 {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}
