import type { TerrainShape, TerrainSpec } from '@/core/sim/types';

/**
 * コース(地形)を組み立てる小さな関数。単位 m、+x が前進方向、+y が上、z が奥行き。
 * 機体は z = 0 を中心に置かれる(脚列の幅は最大でも ±0.6m 程度)。
 */

/** コースの幅の半分(m) */
export const COURSE_HALF_WIDTH = 1.5;

/** 平らな地面だけ */
export function flatCourse(): TerrainSpec {
  return { ground: { y: 0 }, shapes: [] };
}

/** x0..x1 の区間に、上面が top・底が bottom の台(コースの幅いっぱい) */
export function slab(x0: number, x1: number, top: number, bottom = 0): TerrainShape {
  return {
    kind: 'box',
    min: [x0, bottom, -COURSE_HALF_WIDTH],
    max: [x1, top, COURSE_HALF_WIDTH],
  };
}

/** 地面(y = 0)に段差を並べたコース。steps は [x0, x1, 高さ] */
export function stepCourse(steps: [number, number, number][]): TerrainSpec {
  return { ground: { y: 0 }, shapes: steps.map(([x0, x1, h]) => slab(x0, x1, h)) };
}

/**
 * 溝のあるコース。地面は溝の底(y = floor)で、歩く面は台(上面 top)で作る。
 * walks は台の区間 [x0, x1, 上面の高さ]。台と台のすき間が溝になる。
 */
export function ditchCourse(floor: number, walks: [number, number, number][]): TerrainSpec {
  return { ground: { y: floor }, shapes: walks.map(([x0, x1, top]) => slab(x0, x1, top, floor)) };
}

/**
 * (x, z) の真下の地形の高さ(m)。地形がなければ -Infinity。
 * コースの検査とステージ選択の模型用の簡易版(本番の判定は sim の TerrainCollider)。
 */
export function terrainHeightAt(terrain: TerrainSpec, x: number, z: number): number {
  let h = terrain.ground ? terrain.ground.y : -Infinity;
  for (const s of terrain.shapes) {
    if (s.kind === 'box') {
      if (x >= s.min[0] && x <= s.max[0] && z >= s.min[2] && z <= s.max[2]) {
        h = Math.max(h, s.max[1]);
      }
    } else if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) {
      const t = s.x1 > s.x0 ? (x - s.x0) / (s.x1 - s.x0) : 0;
      h = Math.max(h, s.y0 + (s.y1 - s.y0) * t);
    }
  }
  return h;
}
