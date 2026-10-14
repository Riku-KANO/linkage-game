import { describe, expect, it } from 'vitest';
import { analyzeMechanism } from '@/core/kinematics';
import { jansenLeg } from '@/core/model/presets';
import { PAPER_DESIGN } from '@/scene/layout';
import { toScreen } from '@/editor/viewport';
import { drawDesignInk, drawSheet, sheetRegion, trajectoryJoints } from './ink';

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

describe('軌道を描く点(trajectoryJoints)', () => {
  it('ヤンセンの脚:動く点だけで、脚先がいちばん最後(いちばん上に描く)', () => {
    const d = jansenLeg();
    const a = analyzeMechanism(d);
    const js = trajectoryJoints(a);
    expect(js.length).toBeGreaterThan(0);
    expect(js.at(-1)).toBe(a.compiled.footIndex);
    for (const i of js) expect(a.compiled.fixed[i]).toBe(0);
  });

  it('クランクがなければ描かない', () => {
    const d = { ...jansenLeg(), cranks: [] };
    expect(trajectoryJoints(analyzeMechanism(d))).toEqual([]);
  });
});

describe('紙の板の範囲と解像度(sheetRegion)', () => {
  const s = 3.3156;
  const dw = PAPER_DESIGN.xMax - PAPER_DESIGN.xMin;
  const dh = PAPER_DESIGN.yMax - PAPER_DESIGN.yMin;

  it('origin なし:紙全体を覆い、テクスチャ 1 px = 設計画面の 1/k 画面 px', () => {
    const r = sheetRegion(PAPER_DESIGN, s, 1.5)!;
    expect(r.k).toBe(1.5);
    expect(r.rect.minX).toBe(PAPER_DESIGN.xMin);
    expect(r.rect.maxY).toBe(PAPER_DESIGN.yMax);
    expect((r.rect.maxX - r.rect.minX) * s * r.k).toBeCloseTo(r.width, 6);
    expect((r.rect.maxY - r.rect.minY) * s * r.k).toBeCloseTo(r.height, 6);
    expect(r.width).toBe(Math.ceil(dw * s * 1.5));
    // 描画座標の原点 = 範囲の左上、切り抜き = 紙
    const tl = toScreen(r.cam, r.rect.minX, r.rect.maxY);
    expect(tl.x).toBeCloseTo(0, 9);
    expect(tl.y).toBeCloseTo(0, 9);
    expect(r.clip.w).toBeCloseTo(dw * s, 9);
    expect(r.clip.h).toBeCloseTo(dh * s, 9);
  });

  it('origin あり:縁を画面の画素の境目まで内側に縮める(1 画素未満)', () => {
    const origin = { x: 88.15, y: 120.37 };
    for (const dpr of [1, 1.5, 2]) {
      const r = sheetRegion(PAPER_DESIGN, s, dpr, { origin })!;
      const sx0 = origin.x + (r.rect.minX - PAPER_DESIGN.xMin) * s;
      const sy0 = origin.y + (PAPER_DESIGN.yMax - r.rect.maxY) * s;
      const sx1 = origin.x + (r.rect.maxX - PAPER_DESIGN.xMin) * s;
      const sy1 = origin.y + (PAPER_DESIGN.yMax - r.rect.minY) * s;
      for (const v of [sx0, sy0, sx1, sy1]) expect(v * r.k).toBeCloseTo(Math.round(v * r.k), 6);
      // 紙の内側にあり、縮めたのは 1 画素未満
      expect(r.rect.minX).toBeGreaterThanOrEqual(PAPER_DESIGN.xMin);
      expect(r.rect.maxX).toBeLessThanOrEqual(PAPER_DESIGN.xMax);
      expect(r.rect.minY).toBeGreaterThanOrEqual(PAPER_DESIGN.yMin);
      expect(r.rect.maxY).toBeLessThanOrEqual(PAPER_DESIGN.yMax);
      expect((r.rect.minX - PAPER_DESIGN.xMin) * s).toBeLessThan(1 / r.k + 1e-9);
      expect((PAPER_DESIGN.xMax - r.rect.maxX) * s).toBeLessThan(1 / r.k + 1e-9);
      // テクスチャの大きさは範囲の画素数そのもの
      expect((r.rect.maxX - r.rect.minX) * s * r.k).toBeCloseTo(r.width, 6);
      expect((r.rect.maxY - r.rect.minY) * s * r.k).toBeCloseTo(r.height, 6);
    }
  });

  it('大きな画面・高い画素比でもテクスチャの一辺は上限以下', () => {
    const r = sheetRegion(PAPER_DESIGN, 12, 3, { maxTexture: 2048 })!;
    expect(r.width).toBeLessThanOrEqual(2048);
    expect(r.height).toBeLessThanOrEqual(2048);
    expect(r.k).toBeLessThan(3);
    expect(sheetRegion(PAPER_DESIGN, 0, 1)).toBeNull();
  });
});

describe('紙の板を描く(drawSheet)', () => {
  it('紙の絵を板の範囲に写して描き、その上に図面を重ねる(図面なしなら紙だけ)', () => {
    const r = sheetRegion(PAPER_DESIGN, 3.3, 1, { origin: { x: 88.15, y: 120.4 } })!;
    const painted: { W: number; H: number; transform: unknown[] }[] = [];
    let lastTransform: unknown[] = [];
    const { ctx, calls } = recorder();
    const painter = {
      width: 2048,
      height: 1450,
      draw: (_: CanvasRenderingContext2D, W: number, H: number) =>
        painted.push({ W, H, transform: lastTransform }),
    };
    const spy = new Proxy(ctx, {
      get(target, prop: string) {
        const v = (target as unknown as Record<string, unknown>)[prop];
        if (prop === 'setTransform')
          return (...args: unknown[]) => {
            lastTransform = args;
            return (v as (...a: unknown[]) => unknown)(...args);
          };
        return v;
      },
    });
    drawSheet(spy, r, PAPER_DESIGN, painter, null);
    expect(painted).toHaveLength(1);
    const [a, , , d, e, f] = painted[0]!.transform as number[];
    // 紙の絵の (0,0) は紙の左上(板の左上からわずかに外)、(W0,H0) は紙の右下に写る
    const tl = toScreen(r.cam, PAPER_DESIGN.xMin, PAPER_DESIGN.yMax);
    const br = toScreen(r.cam, PAPER_DESIGN.xMax, PAPER_DESIGN.yMin);
    expect(e).toBeCloseTo(tl.x * r.k, 6);
    expect(f).toBeCloseTo(tl.y * r.k, 6);
    expect(e! + a! * 2048).toBeCloseTo(br.x * r.k, 6);
    expect(f! + d! * 1450).toBeCloseTo(br.y * r.k, 6);
    expect(calls.some((c) => c.name === 'stroke')).toBe(false);

    const d0 = jansenLeg();
    drawSheet(spy, r, PAPER_DESIGN, painter, {
      design: d0,
      analysis: analyzeMechanism(d0),
      footLabel: '脚先',
    });
    expect(painted).toHaveLength(2);
    expect(calls.filter((c) => c.name === 'stroke').length).toBeGreaterThan(d0.links.length * 2);
  });
});

describe('図面を描く(drawDesignInk)', () => {
  it('ヤンセンの脚:リンクごとに外側と内側の 2 本、ピンは全部、軌道と固定点の記号を描く', () => {
    const d = jansenLeg();
    const a = analyzeMechanism(d);
    const r = sheetRegion(PAPER_DESIGN, 3.5, 1)!;
    const { ctx, calls } = recorder();
    drawDesignInk(ctx, d, a, r, '脚先');
    // 最初に画素比の変換、紙の縁で切り抜き(紙の絵の上に重ねるので消さない)
    expect(calls[0]!.name).toBe('setTransform');
    expect(calls.some((c) => c.name === 'clearRect')).toBe(false);
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
