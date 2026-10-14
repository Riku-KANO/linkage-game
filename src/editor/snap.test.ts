import { describe, expect, it } from 'vitest';
import { fourBar, jansenLeg } from '@/core/model/presets';
import { findMagnetJoint, hitTest, selectInRect, snapPoint, snapToGrid } from './snap';
import { convexHull, pointInPolygon } from './geometry';

describe('grid snapping', () => {
  it('rounds to the nearest grid step', () => {
    expect(snapToGrid({ x: 1.4, y: -2.6 }, 1)).toEqual({ x: 1, y: -3 });
    expect(snapToGrid({ x: 14, y: 26 }, 10)).toEqual({ x: 10, y: 30 });
    expect(snapToGrid({ x: -0.2, y: 0.2 }, 1)).toEqual({ x: 0, y: 0 });
    expect(Object.is(snapToGrid({ x: -0.2, y: 0 }, 1).x, -0)).toBe(false);
  });
});

describe('magnet snapping', () => {
  const d = fourBar();
  it('pulls a point onto a nearby joint (joint wins over grid)', () => {
    const a = d.joints.find((j) => j.id === 'A')!;
    const r = snapPoint(d, { x: a.x + 0.8, y: a.y - 0.5 }, { grid: 1, magnetRadius: 2 });
    expect(r.joint).toBe('A');
    expect(r.x).toBe(a.x);
    expect(r.y).toBe(a.y);
  });
  it('falls back to the grid outside the magnet radius', () => {
    const r = snapPoint(d, { x: 20.3, y: 40.6 }, { grid: 1, magnetRadius: 2 });
    expect(r).toEqual({ x: 20, y: 41, joint: null });
  });
  it('ignores excluded joints', () => {
    const m = findMagnetJoint(d, { x: 0, y: 0 }, 2, new Set(['O2']));
    expect(m).toBeNull();
  });
});

describe('hit testing', () => {
  const d = jansenLeg();
  it('prefers joints over links', () => {
    const o = d.joints.find((j) => j.id === 'O')!;
    expect(hitTest(d, { x: o.x + 0.3, y: o.y }, 1.5, 1)).toEqual({ kind: 'joint', id: 'O' });
  });
  it('hits a bar near its middle and reports the closest point', () => {
    // crank O(0,0)–A(15,0)
    const h = hitTest(d, { x: 7.5, y: 0.4 }, 1.5, 1);
    expect(h?.kind).toBe('link');
    if (h?.kind === 'link') {
      expect(h.id).toBe('crank');
      expect(h.at.y).toBeCloseTo(0);
    }
  });
  it('hits inside a ternary plate', () => {
    const byId = new Map(d.joints.map((j) => [j.id, j]));
    const [b, c, dd] = ['B', 'C', 'D'].map((id) => byId.get(id)!);
    const centroid = { x: (b!.x + c!.x + dd!.x) / 3, y: (b!.y + c!.y + dd!.y) / 3 };
    const h = hitTest(d, centroid, 1, 0.5);
    expect(h).toMatchObject({ kind: 'link', id: 'bde' });
  });
  it('misses empty space', () => {
    expect(hitTest(d, { x: 200, y: 200 }, 1, 1)).toBeNull();
  });
});

describe('rectangle selection', () => {
  it('selects joints inside and links fully inside', () => {
    const d = fourBar();
    // O2 (0,0) and A (0,10) only
    const s = selectInRect(d, { x: -1, y: -1 }, { x: 1, y: 11 });
    expect(s.joints.sort()).toEqual(['A', 'O2']);
    expect(s.links).toEqual(['crank']);
  });
});

describe('geometry', () => {
  it('convex hull drops interior points', () => {
    const h = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 2 },
      { x: 5, y: 10 },
    ]);
    expect(h).toHaveLength(3);
    expect(pointInPolygon({ x: 5, y: 3 }, h)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 3 }, h)).toBe(false);
  });
});
