import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import {
  PITCH_FOLLOW,
  SFX_NAMES,
  applyRate,
  buildSfx,
  layerFrequencies,
  layersDuration,
  type Layer,
  type ModalLayer,
} from './recipes';
import type { SfxName } from './sfx';

const build = (name: SfxName, seed = 1) => buildSfx(name, mulberry32(seed));
const modal = (layers: Layer[]) => layers.filter((l): l is ModalLayer => l.kind === 'modal');

describe('SFX_NAMES', () => {
  it('契約のすべての効果音を含む', () => {
    expect([...SFX_NAMES].sort()).toEqual(
      ['error', 'gear', 'press', 'release', 'snap', 'stamp', 'step', 'success', 'whoosh'].sort(),
    );
  });
});

describe('buildSfx(効果音の譜面)', () => {
  it.each(SFX_NAMES)('%s:短く、周波数・音量が健全', (name) => {
    const layers = build(name);
    expect(layers.length).toBeGreaterThan(0);
    const dur = layersDuration(layers);
    expect(dur).toBeGreaterThan(0.02);
    expect(dur).toBeLessThanOrEqual(1.2);
    for (const f of layerFrequencies(layers)) {
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(30);
      expect(f).toBeLessThan(18000);
    }
    for (const l of layers) {
      expect(l.at).toBeGreaterThanOrEqual(0);
      if (l.kind === 'modal') {
        for (const p of l.partials) {
          expect(p.gain).toBeGreaterThan(0);
          expect(p.decay).toBeGreaterThan(0);
        }
      } else {
        expect(l.gain).toBeGreaterThan(0);
      }
    }
  });

  it('操作の手応え系(snap/press/release/step/error/gear)は 0.3 秒以内', () => {
    for (const name of ['snap', 'press', 'release', 'step', 'error', 'gear'] as const) {
      expect(layersDuration(build(name))).toBeLessThanOrEqual(0.3);
    }
  });

  it('同じ乱数列なら同じ譜面(決定論)', () => {
    for (const name of SFX_NAMES) expect(build(name, 5)).toEqual(build(name, 5));
  });

  it('呼ぶたびに少しだけ揺らぐ(機関銃のように聞こえない)が、揺らぎは ±10% 以内', () => {
    for (const name of SFX_NAMES) {
      const a = layerFrequencies(build(name, 1));
      const b = layerFrequencies(build(name, 2));
      expect(a.length).toBe(b.length);
      expect(a).not.toEqual(b);
      a.forEach((f, i) => expect(Math.abs(b[i]! / f - 1)).toBeLessThan(0.1));
    }
  });

  it('金属は非整数倍の部分音で長く響き、木は低く短く減衰する', () => {
    const all = SFX_NAMES.flatMap((n) => modal(build(n)));
    const metal = all.filter((l) => l.material === 'metal');
    const wood = all.filter((l) => l.material === 'wood');
    expect(metal.length).toBeGreaterThan(0);
    expect(wood.length).toBeGreaterThan(0);
    for (const l of metal) {
      if (l.partials.length < 2) continue;
      const inharmonic = l.partials.some((p) => Math.abs(p.ratio - Math.round(p.ratio)) > 0.05);
      expect(inharmonic).toBe(true);
    }
    for (const l of wood) {
      expect(l.base).toBeLessThan(500);
      for (const p of l.partials) expect(p.decay).toBeLessThanOrEqual(0.1);
    }
    const longestMetal = Math.max(...metal.flatMap((l) => l.partials.map((p) => p.decay)));
    expect(longestMetal).toBeGreaterThan(0.3);
  });

  it('snap は「カ」と「チッ」の 2 段のクリックと小さな金属の響き', () => {
    const layers = build('snap');
    const clicks = layers.filter((l) => l.kind === 'noise');
    expect(clicks.length).toBeGreaterThanOrEqual(2);
    const starts = clicks.map((l) => l.at).sort((x, y) => x - y);
    expect(starts[starts.length - 1]! - starts[0]!).toBeGreaterThan(0.005);
    expect(modal(layers).some((l) => l.material === 'metal')).toBe(true);
  });

  it('gear はラチェットの刻みが並ぶ', () => {
    const ticks = build('gear').filter((l) => l.kind === 'noise');
    expect(ticks.length).toBeGreaterThanOrEqual(4);
  });

  it('stamp は最も重い(低い打撃)、success は金属の澄んだ響き', () => {
    const lowest = (n: SfxName) => Math.min(...modal(build(n)).map((l) => l.base));
    for (const n of SFX_NAMES) {
      if (n !== 'stamp') expect(lowest('stamp')).toBeLessThan(lowest(n));
    }
    expect(modal(build('success')).every((l) => l.material === 'metal')).toBe(true);
  });

  it('知らない名前は空', () => {
    expect(buildSfx('nope' as SfxName, mulberry32(1))).toEqual([]);
  });
});

describe('applyRate(再生速度)', () => {
  it('rate = 2 で時間は半分、音程は追従率に応じて上がる', () => {
    const base = build('snap');
    const fast = applyRate(base, 2, PITCH_FOLLOW.snap);
    expect(layersDuration(fast)).toBeCloseTo(layersDuration(base) / 2, 6);
    const f0 = layerFrequencies(base);
    layerFrequencies(fast).forEach((f, i) => expect(f).toBeCloseTo(f0[i]! * 2, 6));
  });

  it('gear は速さが主で、音程は少しだけ上がる', () => {
    const base = build('gear');
    const fast = applyRate(base, 2, PITCH_FOLLOW.gear);
    expect(layersDuration(fast)).toBeCloseTo(layersDuration(base) / 2, 6);
    const ratio = layerFrequencies(fast)[0]! / layerFrequencies(base)[0]!;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(1.5);
  });

  it('rate = 1 は何も変えない', () => {
    const base = build('stamp');
    expect(applyRate(base, 1, 1)).toEqual(base);
  });
});
