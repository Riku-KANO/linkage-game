/**
 * 設計ビューのカメラ(ED-1)。設計座標(cm、+y 上)と画面座標(px、+y 下)の変換。
 *
 *   screenX = ox + scale * x
 *   screenY = oy - scale * y
 *
 * React にも DOM にも依存しない純関数だけを置く。
 */

export interface Camera {
  /** 設計原点の画面位置(px) */
  ox: number;
  oy: number;
  /** 1 cm あたりの px */
  scale: number;
}

/** 設計座標の矩形(cm)。y は上向き */
export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 80;

export function toScreen(cam: Camera, x: number, y: number): { x: number; y: number } {
  return { x: cam.ox + cam.scale * x, y: cam.oy - cam.scale * y };
}

export function toWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - cam.ox) / cam.scale, y: (cam.oy - sy) / cam.scale };
}

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** 画面上の点 (sx, sy) を中心に factor 倍ズームする(カーソル位置の設計座標は動かない) */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): Camera {
  const scale = clampScale(cam.scale * factor);
  const k = scale / cam.scale;
  return { scale, ox: sx - (sx - cam.ox) * k, oy: sy - (sy - cam.oy) * k };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, ox: cam.ox + dx, oy: cam.oy + dy };
}

/** 画面の端からの余白(px)。数値なら 4 辺同じ */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const toInsets = (m: number | Insets): Insets =>
  typeof m === 'number' ? { top: m, right: m, bottom: m, left: m } : m;

/**
 * 全体表示の余白。上はバッジの列、脚先の寸法線を描くときは下(歩幅・進む向き)と右(足上げ)を広く取る。
 * 数値は FootGuides の描画位置(DesignCanvas)に合わせてある。
 */
export function fitInsets(footGuides: boolean): Insets {
  const base = 40;
  return {
    top: base + 32,
    left: base,
    bottom: base + (footGuides ? 64 : 0),
    right: base + (footGuides ? 96 : 0),
  };
}

/**
 * 矩形をビューにぴったり収める(縦横比が違えば余白の内側で中央寄せ、はみ出さない側に余白)。
 * margin は 4 辺同じ px、または辺ごとの Insets。
 */
export function cameraForRect(rect: WorldRect, size: Size, margin: number | Insets = 0): Camera {
  const m = toInsets(margin);
  const w = Math.max(1e-6, rect.maxX - rect.minX);
  const h = Math.max(1e-6, rect.maxY - rect.minY);
  const availW = Math.max(1, size.width - m.left - m.right);
  const availH = Math.max(1, size.height - m.top - m.bottom);
  const scale = Math.min(availW / w, availH / h);
  const cx = (rect.minX + rect.maxX) / 2;
  const cy = (rect.minY + rect.maxY) / 2;
  const sx = m.left + availW / 2;
  const sy = m.top + availH / 2;
  return { scale, ox: sx - scale * cx, oy: sy + scale * cy };
}

/** 点群を余白つきで収めるカメラ(点がなければ原点まわり 100cm 四方) */
export function fitPoints(
  points: readonly { x: number; y: number }[],
  size: Size,
  margin: number | Insets = 48,
): Camera {
  const rect = boundsOf(points) ?? { minX: -50, minY: -50, maxX: 50, maxY: 50 };
  // 小さすぎる機構は最低 40cm 四方として扱う(ズームしすぎない)
  const minSpan = 40;
  const pad = (lo: number, hi: number) => {
    const span = hi - lo;
    if (span >= minSpan) return [lo, hi] as const;
    const c = (lo + hi) / 2;
    return [c - minSpan / 2, c + minSpan / 2] as const;
  };
  const [minX, maxX] = pad(rect.minX, rect.maxX);
  const [minY, maxY] = pad(rect.minY, rect.maxY);
  const cam = cameraForRect({ minX, minY, maxX, maxY }, size, margin);
  return { ...cam, scale: clampScale(cam.scale) };
}

export function boundsOf(points: readonly { x: number; y: number }[]): WorldRect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** 画面に見えている設計座標の範囲 */
export function visibleRect(cam: Camera, size: Size): WorldRect {
  const a = toWorld(cam, 0, size.height);
  const b = toWorld(cam, size.width, 0);
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}

/**
 * 方眼の間隔(cm)。細線は 1cm、太線は 10cm が基本。
 * 細線の間隔が minPx 未満になるほど縮小したら 10 倍ずつ粗くする。
 */
export function gridSteps(scale: number, minPx = 4): { minor: number; major: number } {
  let minor = 1;
  while (minor * scale < minPx && minor < 1e6) minor *= 10;
  return { minor, major: minor * 10 };
}

const SNAP_STEPS = [1, 5, 10, 50, 100, 500, 1000];

/**
 * グリッドスナップの間隔(cm)。基本は 1cm で、1 目盛りが 3px 未満になるほど縮小したら粗くする
 * (5cm → 10cm → …)。
 */
export function snapStep(scale: number, minPx = 3): number {
  return SNAP_STEPS.find((s) => s * scale >= minPx) ?? SNAP_STEPS[SNAP_STEPS.length - 1]!;
}
