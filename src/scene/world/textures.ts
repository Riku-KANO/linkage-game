import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * 小さな文字の板(棚の名札・図鑑の額の「?」)を Canvas に描いたテクスチャ。外部のフォントや画像は読まない。
 * document がない環境(テスト)では null。
 */
export function textTexture(
  text: string,
  opts: {
    width?: number;
    height?: number;
    background?: string;
    color?: string;
    font?: string;
    border?: string;
  } = {},
): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const W = opts.width ?? 256;
  const H = opts.height ?? 96;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, W, H);
  }
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = Math.max(2, H * 0.06);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, W - ctx.lineWidth * 2, H - ctx.lineWidth * 2);
  }
  ctx.fillStyle = opts.color ?? '#2b2118';
  ctx.font = opts.font ?? `bold ${Math.round(H * 0.55)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + H * 0.03);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
