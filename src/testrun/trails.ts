/**
 * 脚先の軌跡(S-07)のリングバッファと、帯(リボン)の頂点の組み立て。純粋な計算。
 * 1 点 = [x, y, z, flag](flag は接地中なら 1)。
 */

export const TRAIL_STRIDE = 4;

export interface TrailSet {
  readonly lines: number;
  readonly capacity: number;
  /** lines × capacity × TRAIL_STRIDE */
  readonly data: Float32Array;
  /** 次に書く位置 */
  readonly head: Int32Array;
  readonly count: Int32Array;
}

export function createTrailSet(lines: number, capacity: number): TrailSet {
  const L = Math.max(0, Math.floor(lines));
  const C = Math.max(2, Math.floor(capacity));
  return {
    lines: L,
    capacity: C,
    data: new Float32Array(L * C * TRAIL_STRIDE),
    head: new Int32Array(L),
    count: new Int32Array(L),
  };
}

export function clearTrails(t: TrailSet): void {
  t.head.fill(0);
  t.count.fill(0);
}

export function pushTrail(
  t: TrailSet,
  line: number,
  x: number,
  y: number,
  z: number,
  flag: number,
): void {
  if (line < 0 || line >= t.lines) return;
  const h = t.head[line]!;
  const o = (line * t.capacity + h) * TRAIL_STRIDE;
  t.data[o] = x;
  t.data[o + 1] = y;
  t.data[o + 2] = z;
  t.data[o + 3] = flag;
  t.head[line] = (h + 1) % t.capacity;
  if (t.count[line]! < t.capacity) t.count[line] = t.count[line]! + 1;
}

/** 古い順に out へ書き、点の数を返す */
export function readTrail(t: TrailSet, line: number, out: Float32Array): number {
  if (line < 0 || line >= t.lines) return 0;
  const n = t.count[line]!;
  const start = (t.head[line]! - n + t.capacity) % t.capacity;
  for (let i = 0; i < n; i++) {
    const src = (line * t.capacity + ((start + i) % t.capacity)) * TRAIL_STRIDE;
    const dst = i * TRAIL_STRIDE;
    out[dst] = t.data[src]!;
    out[dst + 1] = t.data[src + 1]!;
    out[dst + 2] = t.data[src + 2]!;
    out[dst + 3] = t.data[src + 3]!;
  }
  return n;
}

export interface RibbonColors {
  /** 接地中・空中の色(RGB 0..1) */
  stance: readonly [number, number, number];
  swing: readonly [number, number, number];
}

/**
 * 点列(古い順、stride 4)から xy 平面内に幅 width の帯を作る(三角形ストリップの頂点:各点 2 つ)。
 * 色は RGBA で、古い点ほど透明。書いた頂点数を返す。
 */
export function writeRibbon(
  pts: Float32Array,
  count: number,
  width: number,
  colors: RibbonColors,
  outPos: Float32Array,
  outColor: Float32Array,
): number {
  if (count < 2) return 0;
  const hw = width / 2;
  for (let i = 0; i < count; i++) {
    const p = i * TRAIL_STRIDE;
    const a = Math.max(0, i - 1) * TRAIL_STRIDE;
    const b = Math.min(count - 1, i + 1) * TRAIL_STRIDE;
    let dx = pts[b]! - pts[a]!;
    let dy = pts[b + 1]! - pts[a + 1]!;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) {
      dx = 1;
      dy = 0;
    } else {
      dx /= l;
      dy /= l;
    }
    // 進む向きの左の法線(xy 平面内)
    const nx = -dy * hw;
    const ny = dx * hw;
    const x = pts[p]!;
    const y = pts[p + 1]!;
    const z = pts[p + 2]!;
    const v = i * 6;
    outPos[v] = x + nx;
    outPos[v + 1] = y + ny;
    outPos[v + 2] = z;
    outPos[v + 3] = x - nx;
    outPos[v + 4] = y - ny;
    outPos[v + 5] = z;
    const c = pts[p + 3]! > 0.5 ? colors.stance : colors.swing;
    const alpha = Math.pow((i + 1) / count, 1.6);
    const ci = i * 8;
    outColor[ci] = c[0];
    outColor[ci + 1] = c[1];
    outColor[ci + 2] = c[2];
    outColor[ci + 3] = alpha;
    outColor[ci + 4] = c[0];
    outColor[ci + 5] = c[1];
    outColor[ci + 6] = c[2];
    outColor[ci + 7] = alpha;
  }
  return count * 2;
}

/** 三角形ストリップを三角形リストにするインデックス(n 点 → (n−1)·2 枚) */
export function ribbonIndex(maxPoints: number): Uint32Array {
  const idx = new Uint32Array(Math.max(0, maxPoints - 1) * 6);
  for (let i = 0; i < maxPoints - 1; i++) {
    const a = i * 2;
    const o = i * 6;
    idx[o] = a;
    idx[o + 1] = a + 1;
    idx[o + 2] = a + 2;
    idx[o + 3] = a + 1;
    idx[o + 4] = a + 3;
    idx[o + 5] = a + 2;
  }
  return idx;
}
