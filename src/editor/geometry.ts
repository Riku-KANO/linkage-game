/** 編集ビュー用の小さな幾何ヘルパー(純関数) */

export interface Pt {
  x: number;
  y: number;
}

/** 凸包(反時計回り、Andrew の単調連鎖法)。同一直線上の点は除く */
export function convexHull(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** 線分 ab 上で p に最も近い点と、そのパラメータ t ∈ [0,1] */
export function closestOnSegment(p: Pt, a: Pt, b: Pt): { x: number; y: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const t = L2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return { x: a.x + dx * t, y: a.y + dy * t, t };
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const c = closestOnSegment(p, a, b);
  return Math.hypot(p.x - c.x, p.y - c.y);
}

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** 凸包の外周の辺(2 点なら 1 本の線分) */
export function hullEdges(hull: readonly Pt[]): [Pt, Pt][] {
  if (hull.length < 2) return [];
  if (hull.length === 2) return [[hull[0]!, hull[1]!]];
  return hull.map((p, i) => [p, hull[(i + 1) % hull.length]!] as [Pt, Pt]);
}
