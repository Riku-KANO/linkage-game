import { describe, expect, it } from 'vitest';
import {
  cameraForRect,
  fitPoints,
  gridSteps,
  panBy,
  snapStep,
  toScreen,
  toWorld,
  visibleRect,
  zoomAt,
  type Camera,
} from './viewport';

const cam: Camera = { ox: 400, oy: 300, scale: 5 };

describe('viewport transforms', () => {
  it('flips y: +y in design goes up on screen', () => {
    const a = toScreen(cam, 0, 0);
    const b = toScreen(cam, 0, 10);
    expect(a).toEqual({ x: 400, y: 300 });
    expect(b.y).toBeLessThan(a.y);
    expect(toScreen(cam, 10, 0).x).toBe(450);
  });

  it('round-trips world ↔ screen', () => {
    for (const [x, y] of [
      [0, 0],
      [12.5, -7.25],
      [-100, 33],
    ] as const) {
      const s = toScreen(cam, x, y);
      const w = toWorld(cam, s.x, s.y);
      expect(w.x).toBeCloseTo(x, 9);
      expect(w.y).toBeCloseTo(y, 9);
    }
  });

  it('zooms around the cursor (the point under the cursor stays put)', () => {
    const sx = 123;
    const sy = 456;
    const before = toWorld(cam, sx, sy);
    const z = zoomAt(cam, sx, sy, 1.7);
    expect(z.scale).toBeCloseTo(8.5);
    const after = toWorld(z, sx, sy);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('clamps the zoom level', () => {
    expect(zoomAt(cam, 0, 0, 1e6).scale).toBeLessThanOrEqual(80);
    expect(zoomAt(cam, 0, 0, 1e-6).scale).toBeGreaterThanOrEqual(0.5);
  });

  it('pans in screen pixels', () => {
    const p = panBy(cam, 10, -20);
    expect(toScreen(p, 0, 0)).toEqual({ x: 410, y: 280 });
  });

  it('maps a world rect exactly onto the view (for aligning with the 3D paper)', () => {
    const rect = { minX: -50, minY: -30, maxX: 50, maxY: 30 };
    const c = cameraForRect(rect, { width: 1000, height: 600 });
    expect(toScreen(c, -50, 30)).toEqual({ x: 0, y: 0 });
    const br = toScreen(c, 50, -30);
    expect(br.x).toBeCloseTo(1000);
    expect(br.y).toBeCloseTo(600);
    const v = visibleRect(c, { width: 1000, height: 600 });
    expect(v.minX).toBeCloseTo(-50);
    expect(v.maxY).toBeCloseTo(30);
  });

  it('fits points with a margin', () => {
    const c = fitPoints(
      [
        { x: -40, y: -90 },
        { x: 20, y: 30 },
      ],
      { width: 800, height: 600 },
      40,
    );
    const a = toScreen(c, -40, 30);
    const b = toScreen(c, 20, -90);
    expect(a.x).toBeGreaterThanOrEqual(39.9);
    expect(a.y).toBeGreaterThanOrEqual(39.9);
    expect(b.x).toBeLessThanOrEqual(760.1);
    expect(b.y).toBeLessThanOrEqual(560.1);
  });

  it('adapts grid density to the zoom level', () => {
    expect(gridSteps(10)).toEqual({ minor: 1, major: 10 });
    expect(gridSteps(4.5)).toEqual({ minor: 1, major: 10 });
    expect(gridSteps(3)).toEqual({ minor: 10, major: 100 });
    expect(gridSteps(0.3)).toEqual({ minor: 100, major: 1000 });
  });

  it('snaps to 1 cm at normal zoom and coarser when zoomed far out', () => {
    expect(snapStep(4)).toBe(1);
    expect(snapStep(1)).toBe(5);
    expect(snapStep(0.5)).toBe(10);
  });
});
