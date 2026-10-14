import type { DesignDoc } from '@/core/model/types';
import type { TerrainSpec, Vec3 } from '@/core/sim/types';
import { sameLegLayout, stageLegs, type StageDef } from '@/game';
import { TEST_TRACK } from '@/scene/layout';

/**
 * 試走コースの置き場所(INT-2)。ステージの地形(sim の座標、m)を工房の窓の外の試走コース
 * (layout.TEST_TRACK)の上に置く。sim の座標と工房の座標は平行移動だけで対応する(縮尺 1)。
 *
 *  - x:ステージのスタート(stage.start.x)が試走コースのスタートの線(TEST_TRACK.xStart)に重なる
 *  - z:スタートの z がコースの中心線(TEST_TRACK.z)
 *  - y:地形のいちばん低いところ(地面か、形の底)がコースの帯の上面に乗る。
 *    平地・段差のコースは地面 = 帯の上面、溝のコースは台が帯の上に立ち、溝の底が帯の上面になる
 */

/** 荒野の試走コースの帯の上面(scene/env/Wasteland の帯は高さ 0.06 の箱で中心が y = 0) */
export const TRACK_SURFACE_Y = 0.03;

export type Offset3 = readonly [number, number, number];

export interface TrackPlacement {
  /** sim の座標 → 工房の座標 の平行移動(m) */
  offset: Offset3;
}

/** 地形のいちばん低いところ(地面の高さと形の底の最小)。何もなければ 0 */
export function lowestTerrainY(terrain: TerrainSpec): number {
  let y = terrain.ground ? terrain.ground.y : Infinity;
  for (const s of terrain.shapes) {
    const bottom = s.kind === 'box' ? s.min[1] : s.bottom;
    if (bottom < y) y = bottom;
  }
  return Number.isFinite(y) ? y : 0;
}

export function trackPlacement(stage: Pick<StageDef, 'terrain' | 'start'>): TrackPlacement {
  return {
    offset: [
      TEST_TRACK.xStart - stage.start.x,
      TRACK_SURFACE_Y - lowestTerrainY(stage.terrain),
      TEST_TRACK.z - stage.start.z,
    ],
  };
}

/** sim の点 → 工房の点(out に書いて返す) */
export function toWorld(p: Vec3, offset: Offset3, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  out.x = p.x + offset[0];
  out.y = p.y + offset[1];
  out.z = p.z + offset[2];
  return out;
}

/**
 * 描画用の地形:地面(無限の平面)は描かない。地面は荒野の試走コースの帯がその代わりになる
 * (testrun の TerrainView は地面を 160m 四方の板で描くため、工房の荒野を覆ってしまう)。
 */
export function courseViewTerrain(terrain: TerrainSpec): TerrainSpec {
  return terrain.ground ? { ...terrain, ground: null } : terrain;
}

/**
 * ステージに属さない設計(設計画面に直接来たときのエディタの設計)を、サンドボックスで試走できる形にする。
 * 脚列がまだ解放されていなければ、脚列はステージの既定に合わせる(章 1 のステージの最初の設計と同じ扱い。
 * エディタの脚列のパネルもそれまでは触れない)。それ以外はそのまま返す。
 */
export function freeDesignForStage(design: DesignDoc, stage: StageDef): DesignDoc {
  if (stage.features.legArray) return design;
  const legs = stageLegs(stage);
  return sameLegLayout(design.legs, legs) ? design : { ...design, legs };
}
