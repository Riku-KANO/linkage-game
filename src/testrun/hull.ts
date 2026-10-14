/**
 * 2D の凸包と、角を丸めた輪郭(プレート・フレーム板の形、支持多角形)。純粋な計算。
 */

export interface P2 {
  x: number;
  y: number;
}

/**
 * 凸包(Andrew の単調連鎖法)。反時計回りの頂点の index を返す。
 * 1 点なら [i]、一直線上の点なら両端の 2 点。重複点は 1 つにまとめる。
 */
export function convexHull(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  count = xs.length,
): number[] {
  const idx: number[] = [];
  for (let i = 0; i < count; i++) idx.push(i);
  idx.sort((a, b) => xs[a]! - xs[b]! || ys[a]! - ys[b]!);
  // 重複を除く
  const pts: number[] = [];
  for (const i of idx) {
    const last = pts[pts.length - 1];
    if (
      last !== undefined &&
      Math.abs(xs[last]! - xs[i]!) < 1e-12 &&
      Math.abs(ys[last]! - ys[i]!) < 1e-12
    )
      continue;
    pts.push(i);
  }
  if (pts.length <= 2) return pts;
  const cross = (o: number, a: number, b: number) =>
    (xs[a]! - xs[o]!) * (ys[b]! - ys[o]!) - (ys[a]! - ys[o]!) * (xs[b]! - xs[o]!);
  const lower: number[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 1e-12
    )
      lower.pop();
    lower.push(p);
  }
  const upper: number[] = [];
  for (let k = pts.length - 1; k >= 0; k--) {
    const p = pts[k]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 1e-12
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  // 全点が一直線上なら両端だけ
  return hull.length >= 2 ? hull : pts.slice(0, 1).concat(pts.slice(-1));
}

/**
 * 凸多角形(反時計回り)を半径 r で外側にふくらませ、角を円弧にした輪郭(反時計回り)。
 * 1 点なら円、2 点なら長円。円弧は 1 周あたり segments 分割の細かさで刻む。
 */
export function roundedOutline(poly: readonly P2[], r: number, segments = 24): P2[] {
  const n = poly.length;
  if (n === 0) return [];
  const out: P2[] = [];
  if (n === 1) {
    const c = poly[0]!;
    for (let i = 0; i < segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]!;
    const cur = poly[i]!;
    const next = poly[(i + 1) % n]!;
    // 反時計回りの多角形では、辺の向きの右側の法線が外向き
    const a0 = Math.atan2(-(cur.x - prev.x), cur.y - prev.y);
    const a1 = Math.atan2(-(next.x - cur.x), next.y - cur.y);
    let sweep = a1 - a0;
    while (sweep < 0) sweep += 2 * Math.PI;
    while (sweep > 2 * Math.PI) sweep -= 2 * Math.PI;
    const steps = Math.max(1, Math.ceil((sweep / (2 * Math.PI)) * segments));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (sweep * k) / steps;
      out.push({ x: cur.x + r * Math.cos(a), y: cur.y + r * Math.sin(a) });
    }
  }
  return out;
}

/** 点が凸多角形(反時計回り、3 点以上)の内側(境界を含む)にあるか */
export function insideConvex(poly: readonly P2[], x: number, y: number, eps = 1e-9): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < -eps) return false;
  }
  return true;
}

/** 多角形の符号つき面積(反時計回りで正) */
export function signedArea(poly: readonly P2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/**
 * convexHull の割り当てなし版(毎フレーム使う支持多角形用)。
 * work は n 以上、out は n + 1 以上の長さ。凸包の頂点 index を反時計回りに out に書き、数を返す。
 */
export function convexHullInto(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  n: number,
  work: Int32Array,
  out: Int32Array,
): number {
  // 挿入ソート(点は数十個まで)
  let m = 0;
  for (let i = 0; i < n; i++) {
    let k = m;
    while (k > 0) {
      const p = work[k - 1]!;
      if (xs[p]! > xs[i]! || (xs[p]! === xs[i]! && ys[p]! > ys[i]!)) {
        work[k] = p;
        k--;
      } else break;
    }
    work[k] = i;
    m++;
  }
  // 重複を除く
  let u = 0;
  for (let i = 0; i < m; i++) {
    const p = work[i]!;
    if (u > 0) {
      const q = work[u - 1]!;
      if (Math.abs(xs[q]! - xs[p]!) < 1e-12 && Math.abs(ys[q]! - ys[p]!) < 1e-12) continue;
    }
    work[u++] = p;
  }
  if (u <= 2) {
    for (let i = 0; i < u; i++) out[i] = work[i]!;
    return u;
  }
  let h = 0;
  for (let i = 0; i < u; i++) {
    const p = work[i]!;
    while (h >= 2 && cross3(xs, ys, out[h - 2]!, out[h - 1]!, p) <= 1e-12) h--;
    out[h++] = p;
  }
  const lowerEnd = h + 1;
  for (let i = u - 2; i >= 0; i--) {
    const p = work[i]!;
    while (h >= lowerEnd && cross3(xs, ys, out[h - 2]!, out[h - 1]!, p) <= 1e-12) h--;
    out[h++] = p;
  }
  h--; // 最後の点は最初の点と同じ
  return h >= 2 ? h : 2;
}

function cross3(xs: ArrayLike<number>, ys: ArrayLike<number>, o: number, a: number, b: number) {
  return (xs[a]! - xs[o]!) * (ys[b]! - ys[o]!) - (ys[a]! - ys[o]!) * (xs[b]! - xs[o]!);
}

/** 点が凸包(index 列、反時計回り、3 点以上)の内側(境界を含む)にあるか。割り当てなし */
export function insideHull(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  hull: ArrayLike<number>,
  m: number,
  x: number,
  y: number,
  eps = 1e-9,
): boolean {
  if (m < 3) return false;
  for (let i = 0; i < m; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % m]!;
    if ((xs[b]! - xs[a]!) * (y - ys[a]!) - (ys[b]! - ys[a]!) * (x - xs[a]!) < -eps) return false;
  }
  return true;
}
