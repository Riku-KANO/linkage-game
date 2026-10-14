import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { PAPER_DESIGN, PAPER_WORLD } from '../layout';
import { BlendCamera, viewProjection } from './BlendCamera';
import {
  DEFAULT_PAPER_INSETS,
  designStationPose,
  designToScreen,
  designToWorld,
  paperScreenRect,
  projectToScreen,
  screenToDesign,
  type Insets,
} from './paper';

function settledRect(w: number, h: number, insets: Insets) {
  const cam = new BlendCamera(45, w / h, 0.05, 60);
  cam.applyPose(designStationPose(w, h, insets));
  const vp = viewProjection(cam, new Matrix4());
  return { cam, vp, rect: paperScreenRect(vp, w, h) };
}

describe('設計画面の定位置(紙の真上の平行投影)', () => {
  it('紙の縦横比を保ったまま、余白を除いた領域にちょうど収まり中央に来る', () => {
    const cases: [number, number, Insets][] = [
      [1600, 900, DEFAULT_PAPER_INSETS],
      [1280, 1000, { top: 10, right: 300, bottom: 20, left: 80 }],
      [800, 1200, { top: 0, right: 0, bottom: 0, left: 0 }],
    ];
    for (const [w, h, ins] of cases) {
      const { rect } = settledRect(w, h, ins);
      const availW = w - ins.left - ins.right;
      const availH = h - ins.top - ins.bottom;
      // 縦横比
      expect(rect.width / rect.height).toBeCloseTo(PAPER_WORLD.width / PAPER_WORLD.height, 6);
      // どちらかの辺がちょうど一致し、もう一方は収まる
      const fitsW = Math.abs(rect.width - availW) < 1e-6;
      const fitsH = Math.abs(rect.height - availH) < 1e-6;
      expect(fitsW || fitsH).toBe(true);
      expect(rect.width).toBeLessThanOrEqual(availW + 1e-6);
      expect(rect.height).toBeLessThanOrEqual(availH + 1e-6);
      // 中央
      expect(rect.left + rect.width / 2).toBeCloseTo(ins.left + availW / 2, 6);
      expect(rect.top + rect.height / 2).toBeCloseTo(ins.top + availH / 2, 6);
    }
  });

  it('画面の上がワールドの −z(設計の +y)、右が +x', () => {
    const w = 1600;
    const h = 900;
    const { vp } = settledRect(w, h, DEFAULT_PAPER_INSETS);
    const [cx, cy, cz] = PAPER_WORLD.center;
    const [x0, y0] = projectToScreen(vp, cx, cy, cz, w, h);
    const [x1] = projectToScreen(vp, cx + 0.1, cy, cz, w, h);
    const [, y1] = projectToScreen(vp, cx, cy, cz - 0.1, w, h);
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeLessThan(y0);
  });

  it('平行投影:紙からの高さが違う点も同じ画面位置に写る', () => {
    const w = 1600;
    const h = 900;
    const { vp } = settledRect(w, h, DEFAULT_PAPER_INSETS);
    const [cx, cy, cz] = PAPER_WORLD.center;
    const a = projectToScreen(vp, cx + 0.2, cy, cz + 0.1, w, h);
    const b = projectToScreen(vp, cx + 0.2, cy + 0.3, cz + 0.1, w, h);
    expect(b[0]).toBeCloseTo(a[0], 6);
    expect(b[1]).toBeCloseTo(a[1], 6);
  });

  it('設計座標の点は、3D の紙の上の同じ点と画面上で一致する(ピクセル単位で位置合わせできる)', () => {
    const w = 1440;
    const h = 900;
    const { vp, rect } = settledRect(w, h, DEFAULT_PAPER_INSETS);
    for (const [x, y] of [
      [0, 0],
      [-107, -91.8],
      [15, 30],
      [PAPER_DESIGN.xMin, PAPER_DESIGN.yMax],
    ] as const) {
      const [wx, wy, wz] = designToWorld(x, y);
      const p3d = projectToScreen(vp, wx, wy, wz, w, h);
      const p2d = designToScreen(rect, PAPER_DESIGN, x, y);
      expect(p2d[0]).toBeCloseTo(p3d[0], 4);
      expect(p2d[1]).toBeCloseTo(p3d[1], 4);
      const back = screenToDesign(rect, PAPER_DESIGN, p2d[0], p2d[1]);
      expect(back[0]).toBeCloseTo(x, 9);
      expect(back[1]).toBeCloseTo(y, 9);
    }
  });

  it('設計範囲は紙の縦横比と一致する', () => {
    const dw = PAPER_DESIGN.xMax - PAPER_DESIGN.xMin;
    const dh = PAPER_DESIGN.yMax - PAPER_DESIGN.yMin;
    expect(dw / dh).toBeCloseTo(PAPER_WORLD.width / PAPER_WORLD.height, 9);
  });
});
