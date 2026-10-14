import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Walker } from './walker';
import { createRapierTerrain } from './terrain';
import { runHeadless } from './headless';
import { awkwardFourBar, jansenTwoSided } from './fixtures';
import type { SimSnapshot, TerrainCollider, TerrainSpec } from './types';

const spec: TerrainSpec = {
  ground: { y: 0 },
  shapes: [
    { kind: 'box', min: [1.5, -0.5, -2], max: [2.5, 0.06, 2] },
    { kind: 'ramp', x0: 3, x1: 6, y0: 0, y1: 0.3, z0: -2, z1: 2, bottom: -0.5 },
  ],
};

let terrainA: TerrainCollider;
let terrainB: TerrainCollider;
beforeAll(async () => {
  terrainA = await createRapierTerrain(spec);
  terrainB = await createRapierTerrain(spec);
});
afterAll(() => {
  terrainA.dispose?.();
  terrainB.dispose?.();
});

/** スナップショットの全ての数値を順に並べる(Float64Array も含む) */
function flatten(snap: SimSnapshot): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'number') out.push(v);
    else if (typeof v === 'boolean') out.push(v ? 1 : 0);
    else if (v instanceof Float64Array) out.push(...v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object')
      for (const k of Object.keys(v).sort()) walk((v as never)[k]);
  };
  walk(snap);
  return out;
}

function bitwiseEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

describe('determinism (SIM-4, S-05)', () => {
  it('two runs with the same input give bitwise-identical snapshots', () => {
    for (const design of [jansenTwoSided(), awkwardFourBar()]) {
      const a = new Walker({ design, terrain: terrainA, start: { x: 0, z: 0 } });
      const b = new Walker({ design, terrain: terrainB, start: { x: 0, z: 0 } });
      for (let s = 1; s <= 8 * 240; s++) {
        a.step();
        b.step();
        if (s % 120 === 0) {
          expect(bitwiseEqual(flatten(a.snapshot()), flatten(b.snapshot()))).toBe(true);
        }
      }
      // it actually moved over the obstacles
      expect(Math.abs(a.snapshot().com.x)).toBeGreaterThan(0.5);
    }
  });

  it('reset() replays the same trajectory', () => {
    const sim = new Walker({ design: jansenTwoSided(), terrain: terrainA, start: { x: 0, z: 0 } });
    const run = () => {
      for (let s = 0; s < 3 * 240; s++) sim.step();
      return flatten(sim.snapshot());
    };
    const first = run();
    sim.reset();
    expect(bitwiseEqual(first, run())).toBe(true);
  });

  it('runHeadless is reproducible', () => {
    const input = { design: jansenTwoSided(), terrain: terrainA, start: { x: 0, z: 0 } };
    const r1 = runHeadless(input, { maxTime: 6, goalX: 4 });
    const r2 = runHeadless({ ...input, terrain: terrainB }, { maxTime: 6, goalX: 4 });
    expect(r2).toEqual(r1);
  });
});
