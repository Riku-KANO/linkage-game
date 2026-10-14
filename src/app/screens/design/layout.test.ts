import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { PAPER_DESIGN } from '@/scene/layout';
import { BlendCamera, viewProjection } from '@/scene/rig/BlendCamera';
import { designStationPose, designToScreen, paperScreenRect } from '@/scene/rig/paper';
import { cameraForRect, toScreen } from '@/editor/viewport';
import {
  DESIGN_UI,
  boxesOverlap,
  designLayout,
  paperPxPerCm,
  predictPaperRect,
  toWorldRect,
  type Box,
} from './layout';

const SIZES: [number, number][] = [
  [1280, 720],
  [1920, 1080],
  [1440, 900],
  [1024, 768],
  [899, 700],
  [800, 600],
  [390, 844],
];

/** カメラが実際に写す紙の矩形(scene の定位置と射影) */
function cameraPaperRect(w: number, h: number, insets: ReturnType<typeof designLayout>['insets']) {
  const cam = new BlendCamera(45, w / h, 0.05, 60);
  cam.applyPose(designStationPose(w, h, insets));
  return paperScreenRect(viewProjection(cam, new Matrix4()), w, h);
}

describe('設計画面の配置(designLayout)', () => {
  it('パネル・道具・上の帯は紙(=機構)に重ならず、画面の中に収まる', () => {
    for (const [w, h] of SIZES) {
      const lay = designLayout(w, h);
      const paper = predictPaperRect(w, h, lay.insets);
      const paperBox: Box = paper;
      for (const [name, box] of Object.entries({
        header: lay.header,
        toolbar: lay.toolbar,
        side: lay.side,
      })) {
        expect(boxesOverlap(box, paperBox), `${name} @${w}x${h}`).toBe(false);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.left + box.width).toBeLessThanOrEqual(w + 1e-9);
        expect(box.top + box.height).toBeLessThanOrEqual(h + 1e-9);
      }
      // 状態行(紙のすぐ下)も下のパネル・画面の外にはみ出さない
      const statusBottom = paper.top + paper.height + DESIGN_UI.gap / 2 + DESIGN_UI.statusHeight;
      if (lay.compact) expect(statusBottom).toBeLessThanOrEqual(lay.side.top + 1e-9);
      else expect(statusBottom).toBeLessThanOrEqual(h);
    }
  });

  it('幅が狭いと横のパネルを下に回し、紙は左右いっぱいに使う', () => {
    const wide = designLayout(1280, 720);
    expect(wide.compact).toBe(false);
    expect(wide.side.left).toBe(1280 - DESIGN_UI.margin - DESIGN_UI.sideWidth);
    expect(wide.insets.right).toBe(DESIGN_UI.margin + DESIGN_UI.sideWidth + DESIGN_UI.gap);
    const narrow = designLayout(800, 600);
    expect(narrow.compact).toBe(true);
    expect(narrow.side.width).toBe(800 - 2 * DESIGN_UI.margin);
    expect(narrow.insets.right).toBe(DESIGN_UI.margin);
    expect(narrow.insets.bottom).toBeGreaterThan(narrow.side.height);
  });

  it('1280×720 でも紙は 1cm = 3px 以上(1cm スナップがそのまま使える)', () => {
    const lay = designLayout(1280, 720);
    expect(paperPxPerCm(1280, 720, lay.insets)).toBeGreaterThan(3);
  });
});

describe('紙の画面矩形の予測(predictPaperRect)', () => {
  it('カメラが落ち着いたときに実際に写る紙の矩形と一致する', () => {
    for (const [w, h] of SIZES) {
      const lay = designLayout(w, h);
      const predicted = predictPaperRect(w, h, lay.insets);
      const actual = cameraPaperRect(w, h, lay.insets);
      expect(predicted.left).toBeCloseTo(actual.left, 4);
      expect(predicted.top).toBeCloseTo(actual.top, 4);
      expect(predicted.width).toBeCloseTo(actual.width, 4);
      expect(predicted.height).toBeCloseTo(actual.height, 4);
    }
  });

  it('paperPxPerCm は紙の幅 ÷ 設計範囲の幅', () => {
    for (const [w, h] of SIZES) {
      const lay = designLayout(w, h);
      const r = predictPaperRect(w, h, lay.insets);
      expect(paperPxPerCm(w, h, lay.insets)).toBeCloseTo(
        r.width / (PAPER_DESIGN.xMax - PAPER_DESIGN.xMin),
        9,
      );
    }
  });
});

describe('紙とエディタの対応(1 cm が同じ長さ)', () => {
  it('紙の矩形に置いたエディタのカメラは、紙の上の点を 3D と同じ画面位置に写す', () => {
    const [w, h] = [1280, 720];
    const lay = designLayout(w, h);
    const rect = predictPaperRect(w, h, lay.insets);
    const cam = cameraForRect(toWorldRect(PAPER_DESIGN), {
      width: rect.width,
      height: rect.height,
    });
    expect(cam.scale).toBeCloseTo(paperPxPerCm(w, h, lay.insets), 9);
    for (const [x, y] of [
      [0, 0],
      [-107, -91.8],
      [42, 31],
      [PAPER_DESIGN.xMin, PAPER_DESIGN.yMin],
    ] as const) {
      const p = toScreen(cam, x, y);
      const q = designToScreen(rect, PAPER_DESIGN, x, y);
      expect(rect.left + p.x).toBeCloseTo(q[0], 6);
      expect(rect.top + p.y).toBeCloseTo(q[1], 6);
    }
  });

  it('toWorldRect は同じ範囲を表す', () => {
    expect(toWorldRect({ xMin: -1, yMin: -2, xMax: 3, yMax: 4 })).toEqual({
      minX: -1,
      minY: -2,
      maxX: 3,
      maxY: 4,
    });
  });
});
