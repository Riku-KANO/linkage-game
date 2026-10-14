import RAPIER from '@dimforge/rapier3d-compat';
import type { TerrainCollider, TerrainContact, TerrainSpec, Vec3 } from './types';
import { DEFAULT_FRICTION } from './constants';

/**
 * 地形の衝突判定(SIM-1)。
 *
 * - `createRapierTerrain`:本番用。TerrainSpec から Rapier の固定コライダー(地面は半空間、
 *   box は直方体、ramp は凸包)を作り、接触球との最近接(contactShape)で深さと法線を求める。
 *   Rapier は衝突判定だけに使い、ワールドを step しない(剛体・関節は使わない)。
 * - `createFlatTerrain`:テスト用の解析的な平面。
 *
 * 複数のコライダーに同時に触れたとき(段差の根元など)は、法線を深さで重み付けして足し合わせた
 * 向きを使い、深さは最大のものを使う(継ぎ目で力が 2 倍にならないように)。
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

let ready: Promise<void> | null = null;
/** Rapier(WASM)の初期化。何度呼んでも 1 回だけ */
export function initRapier(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

interface Entry {
  collider: RAPIER.Collider;
  /** 粗い判定用の AABB(半空間は下に無限) */
  min: [number, number, number];
  max: [number, number, number];
}

export async function createRapierTerrain(spec: TerrainSpec): Promise<TerrainCollider> {
  await initRapier();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const entries: Entry[] = [];

  if (spec.ground) {
    const gy = spec.ground.y;
    const desc = new RAPIER.ColliderDesc(new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 }));
    desc.setTranslation(0, gy, 0);
    entries.push({
      collider: world.createCollider(desc),
      min: [-Infinity, -Infinity, -Infinity],
      max: [Infinity, gy, Infinity],
    });
  }
  for (const s of spec.shapes) {
    if (s.kind === 'box') {
      const [x0, y0, z0] = s.min;
      const [x1, y1, z1] = s.max;
      const desc = RAPIER.ColliderDesc.cuboid(
        Math.abs(x1 - x0) / 2,
        Math.abs(y1 - y0) / 2,
        Math.abs(z1 - z0) / 2,
      ).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      entries.push({
        collider: world.createCollider(desc),
        min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
        max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      });
    } else {
      // 坂:x0..x1 で上面が y0 → y1。底は bottom。z0..z1 の幅。原点からの相対座標で凸包を作り、
      // 平行移動で置く(float32 の精度を保つため)
      const cx = (s.x0 + s.x1) / 2;
      const cz = (s.z0 + s.z1) / 2;
      const by = s.bottom;
      const pts: number[] = [];
      for (const z of [s.z0, s.z1]) {
        pts.push(s.x0 - cx, 0, z - cz, s.x1 - cx, 0, z - cz);
        pts.push(s.x0 - cx, s.y0 - by, z - cz, s.x1 - cx, s.y1 - by, z - cz);
      }
      const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts));
      if (!desc) continue; // 退化した坂(幅 0 など)は無視
      desc.setTranslation(cx, by, cz);
      entries.push({
        collider: world.createCollider(desc),
        min: [Math.min(s.x0, s.x1), by, Math.min(s.z0, s.z1)],
        max: [Math.max(s.x0, s.x1), Math.max(s.y0, s.y1, by), Math.max(s.z0, s.z1)],
      });
    }
  }

  const balls = new Map<number, RAPIER.Ball>();
  const ball = (r: number) => {
    let b = balls.get(r);
    if (!b) {
      b = new RAPIER.Ball(r);
      balls.set(r, b);
    }
    return b;
  };
  const ROT = { x: 0, y: 0, z: 0, w: 1 };
  const pos = { x: 0, y: 0, z: 0 };
  const hit = new RAPIER.ShapeContact(
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
          p.x + r < e.min[0] ||
          p.x - r > e.max[0] ||
          p.y + r < e.min[1] ||
          p.y - r > e.max[1] ||
          p.z + r < e.min[2] ||
          p.z - r > e.max[2]
        )
          continue;
        pos.x = p.x;
        pos.y = p.y;
        pos.z = p.z;
        const c = e.collider.contactShape(ball(r), pos, ROT, 0, hit);
        if (!c) continue;
        const depth = -c.distance;
        if (!(depth > 0)) continue;
        const n = c.normal1;
        sx += n.x * depth;
        sy += n.y * depth;
        sz += n.z * depth;
        if (depth > maxDepth) {
          maxDepth = depth;
          bx = n.x;
          by = n.y;
          bz = n.z;
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
      let top = -Infinity;
      for (const e of entries) {
        if (x < e.min[0] || x > e.max[0] || z < e.min[2] || z > e.max[2]) continue;
        top = Math.max(top, e.max[1]);
      }
      if (top === -Infinity) return -Infinity;
      // AABB の上端の少し上から真下へ光線を飛ばす(float32 の精度を保つため近くから)
      const oy = top + 1;
      const ray = new RAPIER.Ray({ x, y: oy, z }, { x: 0, y: -1, z: 0 });
      let best = -Infinity;
      for (const e of entries) {
        if (x < e.min[0] || x > e.max[0] || z < e.min[2] || z > e.max[2]) continue;
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
