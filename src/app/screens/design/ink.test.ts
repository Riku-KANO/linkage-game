import { describe, expect, it } from 'vitest';
import { analyzeMechanism } from '@/core/kinematics';
import { createEmptyDesign } from '@/core/model/types';
import { jansenLeg } from '@/core/model/presets';
import { PAPER_DESIGN } from '@/scene/layout';
import { toScreen } from '@/editor/viewport';
import { drawDesignInk, inkBounds, inkRegion, trajectoryJoints, INK_MARGIN_PX } from './ink';

/** Canvas 2D の呼び出しを記録するだけの偽物 */
function recorder() {
  const calls: { name: string; args: unknown[]; state: Record<string, unknown> }[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => calls.push({ name: prop, args, state: { ...target } });
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('図面の範囲(inkBounds)', () => {
  it('ヤンセンの脚:設計姿勢の点と脚先の軌道をすべて含む', () => {
    const d = jansenLeg();
    const a = analyzeMechanism(d);
    const b = inkBounds(d, a)!;
    for (const j of d.joints) {
      expect(j.x).toBeGreaterThanOrEqual(b.minX);
      expect(j.x).toBeLessThanOrEqual(b.maxX);
      expect(j.y).toBeGreaterThanOrEqual(b.minY);
      expect(j.y).toBeLessThanOrEqual(b.maxY);
    }
    const f = a.compiled.footIndex;
    expect(f).toBeGreaterThanOrEqual(0);
    a.cycle.positions.forEach((p, s) => {
      if (!a.cycle.ok[s]) return;
      expect(p[f * 2]!).toBeGreaterThanOrEqual(b.minX - 1e-9);
      expect(p[f * 2 + 1]!).toBeGreaterThanOrEqual(b.minY - 1e-9);
    });
    // 脚先の軌道は最後に描く(いちばん上)
    expect(trajectoryJoints(a).at(-1)).toBe(f);
  });

  it('白紙なら null(何も描かない)', () => {
    const d = createEmptyDesign();
    expect(inkBounds(d, analyzeMechanism(d))).toBeNull();
  });
});

describe('テクスチャの範囲と解像度(inkRegion)', () => {
  const bounds = { minX: -60, minY: -90, maxX: 40, maxY: 20 };

  it('余白をつけ、左上を図面に合わせ、大きさは quantum の倍数に切り上げる', () => {
    const r = inkRegion(bounds, PAPER_DESIGN, 3.5, 1.5, { quantum: 64 })!;
    const pad = INK_MARGIN_PX / 3.5;
    expect(r.rect.minX).toBeCloseTo(bounds.minX - pad, 9);
    expect(r.rect.maxY).toBeCloseTo(bounds.maxY + pad, 9);
    expect(r.width % 64).toBe(0);
    expect(r.height % 64).toBe(0);
    expect(r.k).toBe(1.5);
    // テクスチャ 1 px = 設計画面の 1/k 画面 px
    expect((r.rect.maxX - r.rect.minX) * 3.5 * r.k).toBeCloseTo(r.width, 6);
    expect((r.rect.maxY - r.rect.minY) * 3.5 * r.k).toBeCloseTo(r.height, 6);
    expect(r.rect.maxX).toBeGreaterThanOrEqual(bounds.maxX + pad - 1e-9);
    expect(r.rect.minY).toBeLessThanOrEqual(bounds.minY - pad + 1e-9);
    // 描画座標の原点 = 範囲の左上
    const tl = toScreen(r.cam, r.rect.minX, r.rect.maxY);
    expect(tl.x).toBeCloseTo(0, 9);
    expect(tl.y).toBeCloseTo(0, 9);
  });

  it('紙の外ははみ出さない(紙の縁で切る)', () => {
    const r = inkRegion({ minX: -200, minY: -10, maxX: -100, maxY: 80 }, PAPER_DESIGN, 4, 1)!;
    expect(r.rect.minX).toBe(PAPER_DESIGN.xMin);
    expect(r.rect.maxY).toBe(PAPER_DESIGN.yMax);
    // 紙の範囲(描画座標)が切り抜きになる
    const c = toScreen(r.cam, PAPER_DESIGN.xMin, PAPER_DESIGN.yMax);
    expect(r.clip.x).toBeCloseTo(c.x, 9);
    expect(r.clip.y).toBeCloseTo(c.y, 9);
    expect(inkRegion({ minX: 200, minY: 0, maxX: 300, maxY: 10 }, PAPER_DESIGN, 4, 1)).toBeNull();
  });

  it('origin を渡すと、降りきったときテクスチャの縁が画面の画素の境目に来る', () => {
    const origin = { x: 88.15, y: 120.37 };
    for (const dpr of [1, 1.5, 2]) {
      const r = inkRegion(bounds, PAPER_DESIGN, 3.3156, dpr, { origin })!;
      const sx = origin.x + (r.rect.minX - PAPER_DESIGN.xMin) * 3.3156;
      const sy = origin.y + (PAPER_DESIGN.yMax - r.rect.maxY) * 3.3156;
      expect(sx * r.k).toBeCloseTo(Math.round(sx * r.k), 6);
      expect(sy * r.k).toBeCloseTo(Math.round(sy * r.k), 6);
      // 広げるのは 1 画素未満
      expect(bounds.minX - INK_MARGIN_PX / 3.3156 - r.rect.minX).toBeLessThan(1 / 3.3156 + 1e-9);
      expect(bounds.minX - INK_MARGIN_PX / 3.3156 - r.rect.minX).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('大きな画面・高い画素比でもテクスチャの一辺は上限以下', () => {
    const big = { minX: -150, minY: -114, maxX: 90, maxY: 54 };
    const r = inkRegion(big, PAPER_DESIGN, 12, 3, { maxTexture: 2048 })!;
    expect(r.width).toBeLessThanOrEqual(2048);
    expect(r.height).toBeLessThanOrEqual(2048);
    expect(r.k).toBeLessThan(3);
  });
});

describe('図面を描く(drawDesignInk)', () => {
  it('ヤンセンの脚:リンクごとに外側と内側の 2 本、ピンは全部、軌道と固定点の記号を描く', () => {
    const d = jansenLeg();
    const a = analyzeMechanism(d);
    const r = inkRegion(inkBounds(d, a)!, PAPER_DESIGN, 3.5, 1)!;
    const { ctx, calls } = recorder();
    drawDesignInk(ctx, d, a, r, '脚先');
    // 最初に画素比の変換と消去、紙の縁で切り抜き
    expect(calls[0]!.name).toBe('setTransform');
    expect(calls[1]!.name).toBe('clearRect');
    expect(calls.some((c) => c.name === 'clip')).toBe(true);
    const strokes = calls.filter((c) => c.name === 'stroke');
    const outer = strokes.filter((c) => c.state.lineWidth === 9);
    const inner = strokes.filter((c) => c.state.lineWidth === 5);
    expect(outer).toHaveLength(d.links.length);
    expect(inner).toHaveLength(d.links.length);
    // クランクは橙
    expect(outer.filter((c) => c.state.strokeStyle === '#e0761c')).toHaveLength(d.cranks.length);
    // ピン(半径 4.5 の円)はジョイントの数だけ
    const pins = calls.filter((c) => c.name === 'arc' && c.args[2] === 4.5);
    expect(pins).toHaveLength(d.joints.length);
    // 脚先の軌道(太さ 2.5)と脚先のラベル
    expect(strokes.some((c) => c.state.lineWidth === 2.5)).toBe(true);
    expect(calls.some((c) => c.name === 'fillText' && c.args[0] === '脚先')).toBe(true);
    // 固定点の記号(太さ 1.5 の三角形)
    const fixed = d.joints.filter((j) => j.fixed).length;
    expect(strokes.filter((c) => c.state.lineWidth === 1.5).length).toBeGreaterThanOrEqual(fixed);
    expect(calls.at(-1)!.name).toBe('restore');
  });
});
