/** Minimal allocation-light 2D vector helpers. */
export interface Vec2 {
  x: number;
  y: number;
}

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const rotate = (a: Vec2, rad: number): Vec2 => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/**
 * Intersections of circle (c0, r0) and circle (c1, r1).
 * Returns null when the circles do not intersect (組立不能).
 * `sign` picks the solution on the left (+1) or right (-1) of the directed line c0→c1.
 * `slack` is the normalized discriminant h/r0 in [0,1]; ~0 means tangent (死点に近い).
 */
export function circleIntersection(
  c0x: number,
  c0y: number,
  r0: number,
  c1x: number,
  c1y: number,
  r1: number,
): { ax: number; ay: number; hx: number; hy: number; h2: number } | null {
  const dx = c1x - c0x;
  const dy = c1y - c0y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-18) return null;
  const d = Math.sqrt(d2);
  const a = (r0 * r0 - r1 * r1 + d2) / (2 * d);
  const h2 = r0 * r0 - a * a;
  // allow a tiny negative h2 caused by round-off at exact tangency
  if (h2 < -1e-9 * Math.max(1, r0 * r0)) return null;
  const ux = dx / d;
  const uy = dy / d;
  return { ax: c0x + a * ux, ay: c0y + a * uy, hx: -uy, hy: ux, h2: Math.max(0, h2) };
}
