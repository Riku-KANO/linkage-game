import { createRapierTerrain, type TerrainCollider, type TerrainSpec } from '@/core/sim';
import type { StageDef } from '@/game';

/**
 * ステージの地形(Rapier の衝突判定)をステージごとに 1 回だけ作って使い回す。
 * Rapier は試走の直前に読み込む(初回だけ少し待つ)。作るのに失敗したらキャッシュから外し、
 * 次の試走でやり直す。
 */

export type TerrainFactory = (spec: TerrainSpec) => Promise<TerrainCollider>;

export interface TerrainCache {
  get(stage: StageDef): Promise<TerrainCollider>;
  /** 作った地形を捨てる(Rapier のワールドを解放する) */
  clear(): void;
}

export function createTerrainCache(factory: TerrainFactory = createRapierTerrain): TerrainCache {
  const cache = new Map<string, Promise<TerrainCollider>>();
  return {
    get(stage) {
      // ステージ id だけでなく地形の中身もキーにする(開発中にステージを調整しても古い地形を使わない)
      const key = `${stage.id}\u0000${JSON.stringify(stage.terrain)}`;
      let p = cache.get(key);
      if (!p) {
        p = factory(stage.terrain);
        cache.set(key, p);
        p.catch(() => {
          if (cache.get(key) === p) cache.delete(key);
        });
      }
      return p;
    },
    clear() {
      for (const p of cache.values()) {
        p.then((t) => t.dispose?.()).catch(() => {});
      }
      cache.clear();
    },
  };
}
