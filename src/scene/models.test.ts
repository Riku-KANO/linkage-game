import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODEL_MANIFEST, type ModelId } from './assets';
import { BENCH, LOGO_SIGN, ROOM, SHELF, TEST_TRACK } from './layout';

/**
 * 置いてある GLB(art/blender/ → `pnpm models`)の検査。Blender なしで回る:
 * 予算(1 つ 400KB・合計 3MB)、自己完結(外部ファイル・Draco/Meshopt なし)、
 * 向きと原点(+y 上、各コンポーネントの座標)が手続き生成の外形と合っていること。
 */

const dir = fileURLToPath(new URL('../../public/models/', import.meta.url));
const EACH = 400_000;
const TOTAL = 3_000_000;

type V3 = [number, number, number];
interface Gltf {
  asset: { version: string };
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  buffers: { uri?: string; byteLength: number }[];
  images?: { uri?: string }[];
  scenes: { nodes: number[] }[];
  nodes: {
    mesh?: number;
    children?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes: { primitives: { attributes: Record<string, number>; material?: number }[] }[];
  accessors: { min?: number[]; max?: number[] }[];
  materials?: { pbrMetallicRoughness?: { metallicFactor?: number } }[];
}

function readGlb(file: string): { gltf: Gltf; size: number } {
  const b = readFileSync(`${dir}${file}`);
  expect(b.readUInt32LE(0), 'magic glTF').toBe(0x46546c67);
  expect(b.readUInt32LE(4), 'version').toBe(2);
  expect(b.readUInt32LE(8), 'length').toBe(b.length);
  const len = b.readUInt32LE(12);
  expect(b.readUInt32LE(16), 'JSON chunk').toBe(0x4e4f534a);
  const gltf = JSON.parse(b.subarray(20, 20 + len).toString('utf8')) as Gltf;
  return { gltf, size: b.length };
}

/** 全ノード(平行移動だけ。回転・拡大なし)を合わせた外形 */
function bounds(g: Gltf): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const n of g.nodes) {
    expect(n.rotation ?? null, 'ノードは回転しない').toBeNull();
    expect(n.scale ?? null, 'ノードは拡大しない').toBeNull();
    expect(n.children ?? null, '階層は 1 段').toBeNull();
    if (n.mesh === undefined) continue;
    const t = n.translation ?? [0, 0, 0];
    for (const p of g.meshes[n.mesh]!.primitives) {
      const a = g.accessors[p.attributes.POSITION!]!;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i]!, a.min![i]! + t[i]!);
        max[i] = Math.max(max[i]!, a.max![i]! + t[i]!);
      }
    }
  }
  return { min, max };
}

/** 外形の期待:must は必ず覆う箱(手続き生成の外形)、within はこの中に収まる箱 */
interface Expect {
  must: { min: V3; max: V3 };
  within: { min: V3; max: V3 };
}

const T = ROOM.wallThickness;
const [bx, , bz] = BENCH.center;
const EXPECT: Partial<Record<ModelId, Expect>> = {
  // ワールド座標。床・壁・天井(+ 屋根と外へ開いた窓の戸)
  room: {
    must: {
      min: [ROOM.xMin - T, -0.3, ROOM.zBack - T / 2],
      max: [ROOM.xMax + T, ROOM.height, ROOM.zFront],
    },
    within: {
      min: [ROOM.xMin - T - 0.5, -0.4, ROOM.zBack - T - 1.3],
      max: [ROOM.xMax + T + 0.5, ROOM.height + 1.2, ROOM.zFront + 0.6],
    },
  },
  // ワールド座標(Workbench.tsx の ModelSlot は親の変換がない)。万力は手前に少し張り出す
  workbench: {
    must: {
      min: [bx - BENCH.width / 2, 0, bz - BENCH.depth / 2],
      max: [bx + BENCH.width / 2, BENCH.top, bz + BENCH.depth / 2],
    },
    within: {
      min: [bx - BENCH.width / 2 - 0.05, 0, bz - BENCH.depth / 2 - 0.05],
      max: [bx + BENCH.width / 2 + 0.05, BENCH.top + 0.3, bz + BENCH.depth / 2 + 0.25],
    },
  },
  // 棚の局所座標(+z が正面)
  shelf: {
    must: {
      min: [-SHELF.width / 2, 0, -SHELF.depth / 2],
      max: [SHELF.width / 2, SHELF.height, SHELF.depth / 2],
    },
    within: {
      min: [-SHELF.width / 2 - 0.05, 0, -SHELF.depth / 2 - 0.05],
      max: [SHELF.width / 2 + 0.05, SHELF.height + 0.25, SHELF.depth / 2 + 0.05],
    },
  },
  // 工具箱の局所座標(本体 0.52 × 0.2 × 0.26、Toolbox.tsx の BW・BH・BD)
  toolbox: {
    must: { min: [-0.26, 0, -0.13], max: [0.26, 0.2, 0.13] },
    within: { min: [-0.34, 0, -0.16], max: [0.34, 0.24, 0.16] },
  },
  // 窓の外:工房から試走コースまで覆う地面
  wasteland: {
    must: { min: [-150, -0.03, TEST_TRACK.z - 6], max: [150, 5, ROOM.zFront + 3] },
    within: { min: [-215, -10, -215], max: [215, 40, 215] },
  },
  // 看板の局所座標。ロゴの棒(z = 0.045、厚み 0.016)より奥に収める
  logo: {
    must: {
      min: [-LOGO_SIGN.width / 2, -LOGO_SIGN.height / 2, -0.015],
      max: [LOGO_SIGN.width / 2, LOGO_SIGN.height / 2, 0.015],
    },
    within: {
      min: [-LOGO_SIGN.width / 2 - 0.05, -LOGO_SIGN.height / 2 - 0.05, -0.04],
      max: [LOGO_SIGN.width / 2 + 0.05, LOGO_SIGN.height / 2 + 0.4, 0.037],
    },
  },
};

const present = (Object.keys(MODEL_MANIFEST) as ModelId[]).filter(
  (id) => MODEL_MANIFEST[id].present,
);

describe('GLB 素材', () => {
  it('予算:1 つ 400KB 以下、合計 3MB 以下', () => {
    let total = 0;
    for (const id of present) {
      const { size } = readGlb(MODEL_MANIFEST[id].file);
      expect(size, id).toBeLessThanOrEqual(EACH);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(TOTAL);
  });

  for (const id of present) {
    it(`${id}: 自己完結(外部ファイル・Draco/Meshopt・テクスチャなし)で PBR の素材`, () => {
      const { gltf } = readGlb(MODEL_MANIFEST[id].file);
      expect(gltf.asset.version).toBe('2.0');
      expect(gltf.extensionsRequired ?? []).toEqual([]);
      for (const ext of gltf.extensionsUsed ?? []) {
        expect(ext).not.toMatch(/draco|meshopt|texture_basisu|webp/i);
      }
      expect(gltf.buffers.length).toBe(1);
      expect(gltf.buffers[0]!.uri).toBeUndefined();
      expect(gltf.images ?? []).toEqual([]);
      expect(gltf.meshes.length).toBeGreaterThan(0);
      for (const m of gltf.materials ?? []) {
        expect(m.pbrMetallicRoughness, 'metallic/roughness').toBeDefined();
        // 環境マップがないので金属度は控えめ(暗くならない)
        expect(m.pbrMetallicRoughness!.metallicFactor ?? 1).toBeLessThanOrEqual(0.5);
      }
      for (const m of gltf.meshes) {
        for (const p of m.primitives) {
          expect(Object.keys(p.attributes).sort()).toEqual(['COLOR_0', 'NORMAL', 'POSITION']);
        }
      }
    });

    const ex = EXPECT[id];
    if (ex) {
      it(`${id}: 向き(+y 上)と原点が手続き生成の外形に合う`, () => {
        const { gltf } = readGlb(MODEL_MANIFEST[id].file);
        const b = bounds(gltf);
        const eps = 0.011;
        for (let i = 0; i < 3; i++) {
          const axis = 'xyz'[i];
          expect(b.min[i], `${axis} min が覆う`).toBeLessThanOrEqual(ex.must.min[i]! + eps);
          expect(b.max[i], `${axis} max が覆う`).toBeGreaterThanOrEqual(ex.must.max[i]! - eps);
          expect(b.min[i], `${axis} min が収まる`).toBeGreaterThanOrEqual(ex.within.min[i]!);
          expect(b.max[i], `${axis} max が収まる`).toBeLessThanOrEqual(ex.within.max[i]!);
        }
      });
    }
  }
});
