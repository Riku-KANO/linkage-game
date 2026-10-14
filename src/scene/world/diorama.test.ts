import { describe, expect, it } from 'vitest';
import { flatCourse } from '@/game/courses';
import { getStage, STAGES } from '@/game/stages';
import { COURSE_MODEL } from '../layout';
import {
  buildDioramaLayout,
  createRouteSample,
  dioramaToWorld,
  MARKER_OFFSET,
  MARKER_RADIUS,
  markerOf,
  MODEL_GROW,
  PATH_LIFT,
  PATH_WIDTH,
  sampleRoute,
  SAND_TOP,
  terraceHeight,
  terrainHint,
} from './diorama';

const layout = buildDioramaLayout();
const { route, markers, plateaus } = layout;

describe('台地', () => {
  it('章ごとに 1 つ、模型の砂地からはみ出さない', () => {
    expect(plateaus.map((p) => p.chapter)).toEqual([1, 2, 3, 4, 5]);
    for (const p of plateaus) {
      expect(Math.abs(p.x) + p.r).toBeLessThan(COURSE_MODEL.width / 2 - 0.03);
      expect(Math.abs(p.z) + p.r).toBeLessThan(COURSE_MODEL.depth / 2 - 0.03);
      expect(p.top).toBeGreaterThan(SAND_TOP);
    }
  });

  it('ステージのある章 1・2 だけが遊べる台地で、他より大きい', () => {
    expect(plateaus.filter((p) => p.playable).map((p) => p.chapter)).toEqual([1, 2]);
    const smallest = Math.min(...plateaus.filter((p) => p.playable).map((p) => p.r));
    for (const p of plateaus.filter((q) => !q.playable)) expect(p.r).toBeLessThan(smallest);
  });

  it('台地どうしは重ならず、橋でつながる', () => {
    for (let i = 0; i + 1 < plateaus.length; i++) {
      const a = plateaus[i]!;
      const b = plateaus[i + 1]!;
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(a.r + b.r);
    }
    expect(layout.bridges.map((b) => [b.from, b.to])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
  });
});

describe('道のり', () => {
  it('切れ目のない 1 本の線で、点の間隔は 1cm 未満、s は単調に増える', () => {
    for (let i = 1; i < route.count; i++) {
      const d = Math.hypot(route.x[i]! - route.x[i - 1]!, route.z[i]! - route.z[i - 1]!);
      expect(d).toBeLessThan(0.01);
      expect(route.s[i]!).toBeGreaterThan(route.s[i - 1]!);
    }
    expect(route.length).toBeCloseTo(route.s[route.count - 1]!, 12);
  });

  it('台地の上の小道は台地の中に収まり、高さは台地の上面', () => {
    for (const p of plateaus) {
      const [s0, s1] = layout.chapterSpan.get(p.chapter)!;
      const pt = createRouteSample();
      for (let k = 0; k <= 20; k++) {
        sampleRoute(route, s0 + ((s1 - s0) * k) / 20, pt);
        expect(Math.hypot(pt.x - p.x, pt.z - p.z) + PATH_WIDTH / 2).toBeLessThan(p.r);
        expect(pt.y).toBeGreaterThanOrEqual(p.top + PATH_LIFT - 1e-9);
      }
    }
  });

  it('sampleRoute は端で止まり、out をそのまま返す(確保しない)', () => {
    const out = createRouteSample();
    expect(sampleRoute(route, -1, out)).toBe(out);
    expect(out.x).toBeCloseTo(route.x[0]!, 12);
    sampleRoute(route, route.length + 5, out);
    expect(out.x).toBeCloseTo(route.x[route.count - 1]!, 12);
    expect(out.z).toBeCloseTo(route.z[route.count - 1]!, 12);
  });

  it('向きは進む向き(+x 寄り)で、機械が歩く章 1・2 の間は滑らかに変わる', () => {
    const a = createRouteSample();
    const b = createRouteSample();
    const end = layout.chapterSpan.get(2)![1];
    for (let s = 0; s + 0.002 < route.length; s += 0.002) {
      sampleRoute(route, s, a);
      expect(Math.cos(a.heading)).toBeGreaterThan(0);
    }
    for (let s = 0; s + 0.002 < end; s += 0.002) {
      sampleRoute(route, s, a);
      sampleRoute(route, s + 0.002, b);
      expect(
        Math.abs(Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading))),
      ).toBeLessThan(0.2);
    }
  });
});

describe('ステージの目印', () => {
  it('全ステージに 1 つずつ、STAGES の順に道のりに沿って並ぶ', () => {
    expect(markers.map((m) => m.stageId)).toEqual(STAGES.map((s) => s.id));
    for (let i = 1; i < markers.length; i++) {
      expect(markers[i]!.s).toBeGreaterThan(markers[i - 1]!.s);
    }
    expect(markers.map((m) => m.index)).toEqual(STAGES.map((_, i) => i));
  });

  it('自分の章の台地の上に立ち、小道の脇に離れて、隣の目印と重ならない', () => {
    for (const m of markers) {
      const p = plateaus.find((q) => q.chapter === m.chapter)!;
      expect(Math.hypot(m.x - p.x, m.z - p.z) + MARKER_RADIUS).toBeLessThan(p.r * 0.95);
      const pt = sampleRoute(route, m.s, createRouteSample());
      expect(Math.hypot(m.x - pt.x, m.z - pt.z)).toBeCloseTo(MARKER_OFFSET, 6);
      expect(MARKER_OFFSET - MARKER_RADIUS).toBeGreaterThan(PATH_WIDTH / 2);
    }
    for (let i = 1; i < markers.length; i++) {
      const a = markers[i - 1]!;
      const b = markers[i]!;
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(MARKER_RADIUS * 4);
      // 機械(長さ約 4cm)が隣の目印の間に収まる
      expect(b.s - a.s).toBeGreaterThan(0.05);
    }
  });

  it('左右交互に立つ', () => {
    for (const ch of [1, 2]) {
      const sides = markers.filter((m) => m.chapter === ch).map((m) => m.side);
      expect(sides).toEqual([1, -1, 1, -1, 1]);
    }
  });

  it('章 1 は平ら、章 2 は段(台)と溝の手がかりがある', () => {
    for (const m of markers.filter((x) => x.chapter === 1)) {
      expect(m.terrace).toBe(0);
      expect(m.ditchS).toBeNull();
    }
    const ch2 = Object.fromEntries(
      markers.filter((x) => x.chapter === 2).map((m) => [m.stageId, m]),
    );
    expect(ch2['c2-s1']!.terrace).toBeGreaterThan(0);
    expect(ch2['c2-s1']!.ditchS).toBeNull();
    expect(ch2['c2-s4']!.terrace).toBe(0);
    expect(ch2['c2-s4']!.ditchS).not.toBeNull();
    expect(ch2['c2-s5']!.terrace).toBeGreaterThan(0);
    expect(ch2['c2-s5']!.ditchS).not.toBeNull();
    // 高い段のステージほど台も高い(14cm の 2-1 > 4cm の 2-2)
    expect(ch2['c2-s1']!.terrace).toBeGreaterThan(ch2['c2-s2']!.terrace);
  });

  it('段のある目印は台の上に立ち、機械の立つ小道もその分高い', () => {
    const m = markerOf(layout, 'c2-s1')!;
    const p = plateaus.find((q) => q.chapter === 2)!;
    expect(m.y).toBeCloseTo(p.top + m.terrace, 9);
    const pt = sampleRoute(route, m.s, createRouteSample());
    expect(pt.y).toBeCloseTo(p.top + PATH_LIFT + m.terrace, 9);
    // 溝は目印より手前(歩いてくる側)
    const d = markerOf(layout, 'c2-s4')!;
    expect(d.ditchS!).toBeLessThan(d.s);
    expect(d.ditchS!).toBeGreaterThan(markerOf(layout, 'c2-s3')!.s);
  });
});

describe('地形の手がかり', () => {
  it('平らなコースは段も溝もない', () => {
    expect(terrainHint(flatCourse(), 0, 2)).toEqual({ stepM: 0, ditch: false });
    expect(terraceHeight({ stepM: 0, ditch: false })).toBe(0);
  });

  it('段差の高さを拾い、模型の段は 4〜12mm に収める', () => {
    const s = getStage('c2-s1')!;
    const h = terrainHint(s.terrain, s.start.x, s.goal.x);
    expect(h.stepM).toBeCloseTo(0.14, 6);
    expect(h.ditch).toBe(false);
    expect(terraceHeight(h)).toBeLessThanOrEqual(0.012);
    expect(terraceHeight({ stepM: 0.03, ditch: false })).toBe(0.004);
    expect(terraceHeight({ stepM: 1, ditch: false })).toBe(0.012);
  });

  it('溝のコースは溝を拾う', () => {
    const s = getStage('c2-s4')!;
    expect(terrainHint(s.terrain, s.start.x, s.goal.x)).toEqual({ stepM: 0, ditch: true });
  });
});

describe('座標の変換', () => {
  it('模型のローカル → ワールドは中心から MODEL_GROW 倍', () => {
    const out: [number, number, number] = [0, 0, 0];
    dioramaToWorld(COURSE_MODEL.center, 0.1, 0.05, -0.02, out);
    expect(out[0]).toBeCloseTo(COURSE_MODEL.center[0] + 0.1 * MODEL_GROW, 12);
    expect(out[1]).toBeCloseTo(COURSE_MODEL.center[1] + 0.05 * MODEL_GROW, 12);
    expect(out[2]).toBeCloseTo(COURSE_MODEL.center[2] - 0.02 * MODEL_GROW, 12);
  });
});
