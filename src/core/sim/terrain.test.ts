import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFlatTerrain, createRapierTerrain } from './terrain';
import type { TerrainCollider, TerrainSpec } from './types';

const spec: TerrainSpec = {
  ground: { y: 0 },
  shapes: [
    // 段差:x 2..3、高さ 0.2
    { kind: 'box', min: [2, -0.5, -1], max: [3, 0.2, 1] },
    // 坂:x 5..7 で 0 → 0.5(勾配 0.25)
    { kind: 'ramp', x0: 5, x1: 7, y0: 0, y1: 0.5, z0: -1, z1: 1, bottom: -0.2 },
  ],
  friction: 0.7,
};

let rapier: TerrainCollider;
beforeAll(async () => {
  rapier = await createRapierTerrain(spec);
});
afterAll(() => rapier.dispose?.());

describe('flat terrain', () => {
  it('reports depth and an upward normal', () => {
    const t = createFlatTerrain(0.1);
    const c = t.query({ x: 3, y: 0.11, z: -2 }, 0.02);
    expect(c).not.toBeNull();
    expect(c!.depth).toBeCloseTo(0.01, 12);
    expect(c!.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(t.query({ x: 0, y: 0.13, z: 0 }, 0.02)).toBeNull();
    expect(t.heightAt(12, 3)).toBe(0.1);
    expect(t.friction).toBe(0.9);
  });
});

describe('rapier terrain (SIM-1)', () => {
  it('carries the friction coefficient', () => {
    expect(rapier.friction).toBe(0.7);
  });

  it('agrees with the flat terrain on open ground', () => {
    const flat = createFlatTerrain(0);
    for (const y of [0.03, 0.019, 0.01, 0, -0.01]) {
      const p = { x: -3.3, y, z: 0.4 };
      const a = flat.query(p, 0.02);
      const b = rapier.query(p, 0.02);
      if (a === null) {
        expect(b).toBeNull();
        continue;
      }
      expect(b).not.toBeNull();
      expect(b!.depth).toBeCloseTo(a.depth, 5);
      expect(b!.normal.x).toBeCloseTo(0, 5);
      expect(b!.normal.y).toBeCloseTo(1, 5);
      expect(b!.normal.z).toBeCloseTo(0, 5);
    }
    expect(rapier.heightAt(-3.3, 0.4)).toBeCloseTo(0, 5);
  });

  it('box: top face, side face and height', () => {
    const top = rapier.query({ x: 2.5, y: 0.21, z: 0 }, 0.02)!;
    expect(top.depth).toBeCloseTo(0.01, 5);
    expect(top.normal.y).toBeCloseTo(1, 5);
    const side = rapier.query({ x: 1.99, y: 0.1, z: 0 }, 0.02)!;
    expect(side.depth).toBeCloseTo(0.01, 5);
    expect(side.normal.x).toBeCloseTo(-1, 5);
    expect(side.normal.y).toBeCloseTo(0, 5);
    // just inside the top surface
    const inside = rapier.query({ x: 2.5, y: 0.19, z: 0 }, 0.02)!;
    expect(inside.depth).toBeCloseTo(0.03, 5);
    expect(inside.normal.y).toBeCloseTo(1, 5);
    expect(rapier.heightAt(2.5, 0)).toBeCloseTo(0.2, 5);
    // outside the box in z: the ground
    expect(rapier.heightAt(2.5, 1.5)).toBeCloseTo(0, 5);
    expect(rapier.query({ x: 2.5, y: 0.21, z: 1.5 }, 0.02)).toBeNull();
  });

  it('ramp: slanted normal and height', () => {
    const slope = 0.5 / 2;
    const n = { x: -slope, y: 1 };
    const len = Math.hypot(n.x, n.y);
    // a point 1 cm above the slope surface (measured along the normal)
    const sx = 6;
    const sy = 0.25;
    const p = { x: sx + (n.x / len) * 0.01, y: sy + (n.y / len) * 0.01, z: 0 };
    const c = rapier.query(p, 0.02)!;
    expect(c.depth).toBeCloseTo(0.01, 5);
    expect(c.normal.x).toBeCloseTo(n.x / len, 4);
    expect(c.normal.y).toBeCloseTo(n.y / len, 4);
    expect(c.normal.z).toBeCloseTo(0, 4);
    expect(rapier.heightAt(6, 0)).toBeCloseTo(0.25, 5);
    expect(rapier.heightAt(7, 0)).toBeCloseTo(0.5, 4);
  });

  it('ramp contacts are exact even when the sphere centre is on the slope', async () => {
    // 45° の坂:球の中心から斜面までの垂直距離と鉛直距離が大きく違う
    const t = await createRapierTerrain({
      ground: null,
      shapes: [{ kind: 'ramp', x0: 0, x1: 2, y0: 0, y1: 2, z0: -1, z1: 1, bottom: -1 }],
    });
    const r = 0.02;
    const n = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
    // 1e-5 以下は Rapier の凸包(float32 の GJK)だと法線が乱れていた帯
    for (const d of [0.019, 0.015, 0.01, 1e-4, 1e-5, 1e-6, 0.0, -1e-6, -1e-5, -0.01]) {
      for (const sx of [0.3, 1, 1.7]) {
        const p = { x: sx + n.x * d, y: sx + n.y * d, z: 0 };
        const c = t.query(p, r);
        expect(c).not.toBeNull();
        expect(c!.depth).toBeCloseTo(r - d, 4);
        expect(c!.normal.x).toBeCloseTo(n.x, 4);
        expect(c!.normal.y).toBeCloseTo(n.y, 4);
      }
    }
    expect(t.query({ x: 1 + n.x * 0.021, y: 1 + n.y * 0.021, z: 0 }, r)).toBeNull();
    t.dispose?.();
  });

  it('ramp: vertical end face, side face and the top edge', async () => {
    const t = await createRapierTerrain({
      ground: null,
      shapes: [{ kind: 'ramp', x0: 0, x1: 2, y0: 0.5, y1: 1, z0: -1, z1: 1, bottom: 0 }],
    });
    // the high end (x = 2) is a vertical wall
    const end = t.query({ x: 2.01, y: 0.5, z: 0 }, 0.02)!;
    expect(end.depth).toBeCloseTo(0.01, 9);
    expect(end.normal).toEqual({ x: 1, y: 0, z: 0 });
    // side face (z = 1)
    const side = t.query({ x: 1, y: 0.3, z: 1.005 }, 0.02)!;
    expect(side.depth).toBeCloseTo(0.015, 9);
    expect(side.normal).toEqual({ x: 0, y: 0, z: 1 });
    // diagonal outside the top-right edge
    const e = 0.01 / Math.SQRT2;
    const edge = t.query({ x: 2 + e, y: 1 + e, z: 0 }, 0.02)!;
    expect(edge.depth).toBeCloseTo(0.01, 9);
    expect(edge.normal.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(edge.normal.y).toBeCloseTo(Math.SQRT1_2, 9);
    // deep inside: nearest face wins
    const inside = t.query({ x: 1, y: 0.7, z: 0 }, 0.02)!;
    expect(inside.normal.y).toBeGreaterThan(0.9);
    expect(t.heightAt(1, 0)).toBeCloseTo(0.75, 12);
    expect(t.heightAt(3, 0)).toBe(-Infinity);
    t.dispose?.();
  });

  it('combines simultaneous contacts (ground and a wall)', () => {
    // at the foot of the box: touching both the ground and the side face
    const c = rapier.query({ x: 1.99, y: 0.01, z: 0 }, 0.02)!;
    // depth is the deepest single contact (no doubling at seams), normal is the weighted sum
    expect(c.depth).toBeCloseTo(0.01, 5);
    expect(c.normal.x).toBeCloseTo(-Math.SQRT1_2, 4);
    expect(c.normal.y).toBeCloseTo(Math.SQRT1_2, 4);
    expect(Math.hypot(c.normal.x, c.normal.y, c.normal.z)).toBeCloseTo(1, 9);
  });

  it('does not double the depth at the seam of two coplanar boxes', async () => {
    const t = await createRapierTerrain({
      ground: null,
      shapes: [
        { kind: 'box', min: [0, 0, -1], max: [1, 0.2, 1] },
        { kind: 'box', min: [1, 0, -1], max: [2, 0.2, 1] },
      ],
    });
    const seam = t.query({ x: 1, y: 0.21, z: 0 }, 0.02)!;
    expect(seam.depth).toBeCloseTo(0.01, 5);
    expect(seam.normal.y).toBeCloseTo(1, 5);
    t.dispose?.();
  });

  it('terrain without ground returns -Infinity outside shapes', async () => {
    const t = await createRapierTerrain({
      ground: null,
      shapes: [{ kind: 'box', min: [0, 0, -1], max: [1, 1, 1] }],
    });
    expect(t.heightAt(-5, 0)).toBe(-Infinity);
    expect(t.heightAt(0.5, 0)).toBeCloseTo(1, 5);
    expect(t.query({ x: -5, y: -100, z: 0 }, 0.02)).toBeNull();
    expect(t.friction).toBe(0.9);
    t.dispose?.();
  });
});
