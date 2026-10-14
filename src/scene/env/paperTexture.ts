import { CanvasTexture, SRGBColorSpace } from 'three';
import { t } from '@/i18n';
import { PAPER_DESIGN } from '../layout';

/**
 * 製図用紙のテクスチャ(Canvas に描く)。設計座標の方眼(10cm ごと、50cm ごとに太線)と原点の十字。
 * 編集ビューを重ねたとき、方眼が設計座標と一致していることを目で確かめられる。
 */
export function createPaperTexture(width = 2048): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const d = PAPER_DESIGN;
  const W = width;
  const H = Math.round((W * (d.yMax - d.yMin)) / (d.xMax - d.xMin));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const sx = (x: number) => ((x - d.xMin) / (d.xMax - d.xMin)) * W;
  const sy = (y: number) => ((d.yMax - y) / (d.yMax - d.yMin)) * H;

  // 紙(わずかに周辺を暗く)
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, '#f3ead6');
  g.addColorStop(1, '#e2d5b8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 方眼
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  for (const [step, color, lw] of [
    [10, 'rgba(70, 110, 160, 0.22)', 1.2],
    [50, 'rgba(60, 100, 155, 0.45)', 2.2],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    for (let x = Math.ceil(d.xMin / step) * step; x <= d.xMax; x += step) {
      line(sx(x), 0, sx(x), H);
    }
    for (let y = Math.ceil(d.yMin / step) * step; y <= d.yMax; y += step) {
      line(0, sy(y), W, sy(y));
    }
  }
  // 原点の十字
  ctx.strokeStyle = 'rgba(190, 70, 50, 0.85)';
  ctx.lineWidth = 3;
  line(sx(-6), sy(0), sx(6), sy(0));
  line(sx(0), sy(-6), sx(0), sy(6));
  ctx.beginPath();
  ctx.arc(sx(0), sy(0), (3 / (d.xMax - d.xMin)) * W, 0, Math.PI * 2);
  ctx.stroke();

  // 縁取りと表題欄
  ctx.strokeStyle = 'rgba(43, 33, 24, 0.75)';
  ctx.lineWidth = 5;
  const m = W * 0.012;
  ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  const tbW = W * 0.24;
  const tbH = H * 0.09;
  ctx.lineWidth = 3;
  ctx.strokeRect(W - m - tbW, H - m - tbH, tbW, tbH);
  line(W - m - tbW, H - m - tbH / 2, W - m, H - m - tbH / 2);
  ctx.fillStyle = 'rgba(43, 33, 24, 0.8)';
  ctx.font = `bold ${Math.round(tbH * 0.32)}px 'Hiragino Sans', 'Noto Sans JP', sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(t('scene.paper.title'), W - m - tbW + tbH * 0.25, H - m - tbH * 0.75);
  ctx.font = `${Math.round(tbH * 0.22)}px 'Hiragino Sans', 'Noto Sans JP', sans-serif`;
  ctx.fillText(t('scene.paper.units'), W - m - tbW + tbH * 0.25, H - m - tbH * 0.25);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
