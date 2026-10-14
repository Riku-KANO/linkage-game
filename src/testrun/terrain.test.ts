import { describe, expect, it } from 'vitest';
import type { TerrainSpec } from '@/core/sim/types';
import {
  buildTerrainMesh,
  courseBounds,
  distanceTicks,
  shapeTopAt,
  terrainHeightAt,
} from './terrain';

const course: TerrainSpec = {
  ground: null,
  shapes: [
    { kind: 'box', min: [-2, -0.5, -0.8], max: [4, 0, 0.8] },
    { kind: 'box', min: [4, -0.5, -0.8], max: [6, 0.06, 0.8] },
    { kind: 'box', min: [6, -0.5, -0.8], max: [6.4, -0.3, 0.8] },
    { kind: 'ramp', x0: 6.4, x1: 8.4, y0: 0, y1: 0.2, z0: -0.8, z1: 0.8, bottom: -0.5 },
  ],
};

describe('terrainHeightAt', () => {
  it('returns the top of boxes, ramps and ground', () => {
    expect(terrainHeightAt(course, 0, 0)).toBe(0);
    expect(terrainHeightAt(course, 5, 0.3)).toBeCloseTo(0.06);
    expect(terrainHeightAt(course, 6.2, 0)).toBeCloseTo(-0.3);
    expect(terrainHeightAt(course, 7.4, 0)).toBeCloseTo(0.1);
    // 外側は何もない
    expect(terrainHeightAt(course, 20, 0)).toBe(-Infinity);
    expect(terrainHeightAt(course, 0, 2)).toBe(-Infinity);
  });

  it('uses the highest of overlapping shapes and the ground plane', () => {
    const spec: TerrainSpec = {
      ground: { y: -0.1 },
      shapes: [{ kind: 'box', min: [0, 0, 0], max: [1, 0.2, 1] }],
    };
    expect(terrainHeightAt(spec, 0.5, 0.5)).toBeCloseTo(0.2);
    expect(terrainHeightAt(spec, 5, 5)).toBeCloseTo(-0.1);
  });

  it('handles ramps given right-to-left', () => {
    const r = { kind: 'ramp', x0: 2, x1: 0, y0: 1, y1: 0, z0: 0, z1: 1, bottom: 0 } as const;
    expect(shapeTopAt(r, 0.5, 0.5)).toBeCloseTo(0.25);
  });
});

describe('courseBounds / distanceTicks', () => {
  it('covers all shapes and the start/goal', () => {
    const b = courseBounds(course, { start: { x: -1 }, goal: { x: 12 } });
    expect(b).toMatchObject({ xMin: -2, xMax: 12, zMin: -0.8, zMax: 0.8, yMin: -0.5 });
    expect(b.yMax).toBeCloseTo(0.2);
  });

  it('falls back for a ground-only spec', () => {
    const b = courseBounds({ ground: { y: 0 }, shapes: [] }, { goal: { x: 5 } });
    expect(b.zMin).toBeLessThan(0);
    expect(b.zMax).toBeGreaterThan(0);
    expect(b.xMax).toBe(10);
  });

  it('places ticks on integer multiples', () => {
    expect(distanceTicks(-0.5, 3.2)).toEqual([0, 1, 2, 3]);
    expect(distanceTicks(0, 2, 0.5)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(distanceTicks(3, 1)).toEqual([]);
  });
});

describe('buildTerrainMesh', () => {
  it('emits 12 triangles per shape with unit normals', () => {
    const m = buildTerrainMesh(course.shapes);
    expect(m.positions.length).toBe(course.shapes.length * 12 * 3 * 3);
    expect(m.normals.length).toBe(m.positions.length);
    expect(m.uvs.length).toBe((m.positions.length / 3) * 2);
    for (let i = 0; i < m.normals.length; i += 3) {
      expect(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!)).toBeCloseTo(1, 5);
    }
  });

  it('top faces of boxes point up and sit at max y', () => {
    const m = buildTerrainMesh([{ kind: 'box', min: [0, 0, 0], max: [1, 0.5, 2] }]);
    // 最初の 6 頂点が上面
    for (let v = 0; v < 6; v++) {
      expect(m.positions[v * 3 + 1]).toBeCloseTo(0.5);
      expect(m.normals[v * 3 + 1]).toBeCloseTo(1);
    }
    // 側面の法線は外向き:+x 面の頂点は x=1 で法線 +x
    for (let v = 12; v < 18; v++) {
      expect(m.positions[v * 3]).toBeCloseTo(1);
      expect(m.normals[v * 3]).toBeCloseTo(1);
    }
  });

  it('ramp top follows the slope and faces upward', () => {
    const m = buildTerrainMesh([
      { kind: 'ramp', x0: 0, x1: 2, y0: 0, y1: 1, z0: 0, z1: 1, bottom: -0.1 },
    ]);
    for (let v = 0; v < 6; v++) {
      const x = m.positions[v * 3]!;
      expect(m.positions[v * 3 + 1]).toBeCloseTo(x / 2);
      expect(m.normals[v * 3 + 1]).toBeGreaterThan(0.8);
    }
  });
});
