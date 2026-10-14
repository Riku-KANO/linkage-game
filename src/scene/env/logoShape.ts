/**
 * タイトルロゴ「アシクミ」をリンクの棒で組む形(簡易版)。
 * 文字ごとに 1 × 1 の枠で、各画は棒(端点 2 つ)。端点にはピンが付く。
 * 最後にクランク(円盤と腕)が付き、組み上がると一回転してロゴが一歩踏み出す。
 */

export type Seg = readonly [number, number, number, number];

/** 文字ごとの画(x0, y0, x1, y1)。y 上向き */
export const LOGO_GLYPHS: readonly (readonly Seg[])[] = [
  // ア
  [
    [0.05, 0.92, 0.95, 0.92],
    [0.95, 0.92, 0.66, 0.58],
    [0.48, 0.7, 0.44, 0.32],
    [0.44, 0.32, 0.12, 0.02],
  ],
  // シ
  [
    [0.08, 0.9, 0.3, 0.76],
    [0.02, 0.56, 0.24, 0.42],
    [0.12, 0.04, 0.55, 0.32],
    [0.55, 0.32, 0.94, 0.86],
  ],
  // ク
  [
    [0.4, 0.98, 0.08, 0.56],
    [0.3, 0.8, 0.9, 0.8],
    [0.9, 0.8, 0.62, 0.32],
    [0.62, 0.32, 0.16, 0.0],
  ],
  // ミ
  [
    [0.18, 0.94, 0.82, 0.8],
    [0.24, 0.6, 0.76, 0.48],
    [0.1, 0.24, 0.9, 0.06],
  ],
];

export const GLYPH_PITCH = 1.22;

export interface LogoBar {
  glyph: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** ロゴ全体の棒(左下原点、単位は文字の高さ) */
export function logoBars(): LogoBar[] {
  const out: LogoBar[] = [];
  LOGO_GLYPHS.forEach((segs, g) => {
    for (const [x0, y0, x1, y1] of segs) {
      out.push({ glyph: g, x0: x0 + g * GLYPH_PITCH, y0, x1: x1 + g * GLYPH_PITCH, y1 });
    }
  });
  return out;
}

/** ピン(棒の端点、重複を除く) */
export function logoPins(bars: readonly LogoBar[]): { x: number; y: number; glyph: number }[] {
  const out: { x: number; y: number; glyph: number }[] = [];
  for (const b of bars) {
    for (const [x, y] of [
      [b.x0, b.y0],
      [b.x1, b.y1],
    ] as const) {
      if (!out.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-6)) out.push({ x, y, glyph: b.glyph });
    }
  }
  return out;
}

/** ロゴの幅(文字の高さ単位、クランクを含まない) */
export const LOGO_WIDTH = (LOGO_GLYPHS.length - 1) * GLYPH_PITCH + 1;

/**
 * 組み上がりの時間割(s)。i 番目の棒が飛んできてはまる区間 [start, start + dur]。
 * 全体は assemble 秒に収まる。
 */
export function barSchedule(
  i: number,
  n: number,
  assemble: number,
): { start: number; dur: number } {
  const dur = Math.min(0.55, assemble * 0.4);
  const span = Math.max(0, assemble - dur - 0.1);
  return { start: 0.1 + (n > 1 ? (i / (n - 1)) * span : 0), dur };
}
