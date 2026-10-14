import { describe, expect, it } from 'vitest';
import {
  clearTrails,
  createTrailSet,
  pushTrail,
  readTrail,
  ribbonIndex,
  TRAIL_STRIDE,
  writeRibbon,
} from './trails';

describe('trail ring buffer', () => {
  it('keeps the newest points in order, per line', () => {
    const t = createTrailSet(2, 4);
    for (let i = 0; i < 6; i++) pushTrail(t, 0, i, 0, 0, i % 2);
    pushTrail(t, 1, 42, 1, 2, 1);
    const out = new Float32Array(4 * TRAIL_STRIDE);
    expect(readTrail(t, 0, out)).toBe(4);
    expect([out[0], out[4], out[8], out[12]]).toEqual([2, 3, 4, 5]);
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(1);
    expect(readTrail(t, 1, out)).toBe(1);
    expect(Array.from(out.slice(0, 4))).toEqual([42, 1, 2, 1]);
    expect(readTrail(t, 5, out)).toBe(0);
    clearTrails(t);
    expect(readTrail(t, 0, out)).toBe(0);
  });
});

describe('writeRibbon', () => {
  it('offsets each point by half the width in the xy plane and fades older points', () => {
    const pts = new Float32Array([0, 0, 0.5, 1, 1, 0, 0.5, 0, 2, 0, 0.5, 1]);
    const pos = new Float32Array(3 * 6);
    const col = new Float32Array(3 * 8);
    const colors = { stance: [0, 1, 0], swing: [1, 0, 0] } as const;
    expect(writeRibbon(pts, 3, 0.2, colors, pos, col)).toBe(6);
    for (let i = 0; i < 3; i++) {
      const ax = pos[i * 6]!;
      const ay = pos[i * 6 + 1]!;
      const bx = pos[i * 6 + 3]!;
      const by = pos[i * 6 + 4]!;
      expect(Math.hypot(ax - bx, ay - by)).toBeCloseTo(0.2, 6);
      expect(pos[i * 6 + 2]).toBeCloseTo(0.5);
      expect((ax + bx) / 2).toBeCloseTo(pts[i * 4]!, 6);
    }
    // 接地中は stance の色、古い点ほど透明
    expect([col[0], col[1], col[2]]).toEqual([0, 1, 0]);
    expect([col[8], col[9], col[10]]).toEqual([1, 0, 0]);
    expect(col[3]!).toBeLessThan(col[19]!);
    expect(col[19]).toBeCloseTo(1);
    expect(writeRibbon(pts, 1, 0.2, colors, pos, col)).toBe(0);
  });

  it('builds a triangle index for the strip', () => {
    const idx = ribbonIndex(3);
    expect(Array.from(idx)).toEqual([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
  });
});
