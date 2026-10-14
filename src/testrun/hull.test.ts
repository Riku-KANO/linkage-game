import { describe, expect, it } from 'vitest';
import {
  convexHull,
  convexHullInto,
  insideConvex,
  insideHull,
  roundedOutline,
  signedArea,
  type P2,
} from './hull';

const hullOf = (pts: [number, number][]) =>
  convexHull(
    pts.map((p) => p[0]),
    pts.map((p) => p[1]),
  );

describe('convexHull', () => {
  it('returns the CCW hull and drops interior points', () => {
    const pts: [number, number][] = [
      [0, 0],
      [2, 0],
      [1, 1],
      [2, 2],
      [0, 2],
    ];
    const h = hullOf(pts);
    expect(h).toHaveLength(4);
    expect(h).not.toContain(2);
    const poly = h.map((i) => ({ x: pts[i]![0], y: pts[i]![1] }));
    expect(signedArea(poly)).toBeCloseTo(4);
  });

  it('handles 1 point, duplicates and collinear points', () => {
    expect(hullOf([[1, 1]])).toEqual([0]);
    expect(
      hullOf([
        [1, 1],
        [1, 1],
      ]),
    ).toHaveLength(1);
    const col = hullOf([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(col.sort()).toEqual([0, 2]);
  });
});

describe('roundedOutline', () => {
  it('inflates a triangle by r with arcs at the corners (CCW)', () => {
    const tri: P2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const r = 0.1;
    const out = roundedOutline(tri, r, 32);
    expect(signedArea(out)).toBeGreaterThan(signedArea(tri));
    // 輪郭のどの点も、三角形からの距離がほぼ r
    for (const p of out) {
      const d = distToTriangle(p, tri);
      expect(d).toBeGreaterThan(r - 1e-6);
      expect(d).toBeLessThan(r + 1e-6);
    }
  });

  it('makes a circle for one point and a stadium for two', () => {
    const c = roundedOutline([{ x: 1, y: 2 }], 0.5, 16);
    expect(c).toHaveLength(16);
    for (const p of c) expect(Math.hypot(p.x - 1, p.y - 2)).toBeCloseTo(0.5);
    const s = roundedOutline(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      0.5,
      16,
    );
    expect(signedArea(s)).toBeGreaterThan(0);
    // 長円の面積 ≈ 2·1 + π·0.25
    expect(signedArea(s)).toBeCloseTo(2 + Math.PI * 0.25, 1);
  });
});

describe('insideConvex', () => {
  it('tests points against a CCW polygon', () => {
    const sq: P2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(insideConvex(sq, 0.5, 0.5)).toBe(true);
    expect(insideConvex(sq, 1, 0.5)).toBe(true);
    expect(insideConvex(sq, 1.1, 0.5)).toBe(false);
    expect(insideConvex(sq.slice(0, 2), 0.5, 0)).toBe(false);
  });
});

function distToTriangle(p: P2, tri: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const a = tri[i]!;
    const b = tri[(i + 1) % 3]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

describe('convexHullInto / insideHull (allocation-free)', () => {
  function lcg(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  it('matches convexHull on random point sets', () => {
    const rnd = lcg(9);
    const work = new Int32Array(64);
    const out = new Int32Array(65);
    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + Math.floor(rnd() * 30);
      const xs = Array.from({ length: n }, () => Math.round(rnd() * 20) / 4);
      const ys = Array.from({ length: n }, () => Math.round(rnd() * 20) / 4);
      const ref = convexHull(xs, ys);
      const m = convexHullInto(xs, ys, n, work, out);
      const got = Array.from(out.slice(0, m));
      // 始点が違っても同じ順の巡回なら同じ
      const pts = (ids: number[]) => ids.map((i) => `${xs[i]},${ys[i]}`);
      const a = pts(ref);
      const b = pts(got);
      expect(b.length).toBe(a.length);
      if (a.length > 0) {
        const shift = b.indexOf(a[0]!);
        expect(shift).toBeGreaterThanOrEqual(0);
        expect([...b.slice(shift), ...b.slice(0, shift)]).toEqual(a);
      }
    }
  });

  it('tests containment against the index hull', () => {
    const xs = [0, 1, 1, 0, 0.5];
    const ys = [0, 0, 1, 1, 0.5];
    const work = new Int32Array(8);
    const out = new Int32Array(9);
    const m = convexHullInto(xs, ys, 5, work, out);
    expect(m).toBe(4);
    expect(insideHull(xs, ys, out, m, 0.5, 0.5)).toBe(true);
    expect(insideHull(xs, ys, out, m, 1.5, 0.5)).toBe(false);
    expect(insideHull(xs, ys, out, 2, 0.5, 0.5)).toBe(false);
  });
});
