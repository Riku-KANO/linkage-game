import { describe, expect, it } from 'vitest';
import { REDUCED_MOTION_FADE } from '@/ui/tokens';
import { buildResultTimeline, spanEnd } from './timeline';

describe('buildResultTimeline', () => {
  const first = buildResultTimeline({ short: false, reducedMotion: false, stamps: true });
  const short = buildResultTimeline({ short: true, reducedMotion: false, stamps: true });

  it('4 軸のメーターは順に回り始め、順に止まる', () => {
    expect(first.meters).toHaveLength(4);
    for (let i = 1; i < first.meters.length; i++) {
      expect(first.meters[i]!.start).toBeGreaterThan(first.meters[i - 1]!.start);
      expect(spanEnd(first.meters[i]!)).toBeGreaterThan(spanEnd(first.meters[i - 1]!));
    }
  });

  it('メーターはパネルが開き始めてから回り、刻印はすべてのメーターが止まってから', () => {
    expect(first.meters[0]!.start).toBeGreaterThan(first.panel.start);
    const metersDone = Math.max(...first.meters.map(spanEnd));
    expect(first.stamps).toHaveLength(4);
    expect(first.stamps[0]!.start).toBeGreaterThanOrEqual(metersDone);
    for (let i = 1; i < first.stamps.length; i++) {
      expect(first.stamps[i]!.start).toBeGreaterThan(first.stamps[i - 1]!.start);
    }
    expect(first.total).toBeCloseTo(Math.max(...first.stamps.map(spanEnd)));
  });

  it('2 回目以降(short)は大幅に短い', () => {
    expect(short.total).toBeLessThan(first.total * 0.55);
    expect(short.total).toBeGreaterThan(0.8);
  });

  it('刻印しない(失敗)ときはメーターで終わる', () => {
    const fail = buildResultTimeline({ short: false, reducedMotion: false, stamps: false });
    expect(fail.stamps).toHaveLength(0);
    expect(fail.total).toBeCloseTo(Math.max(...fail.meters.map(spanEnd)));
  });

  it('動きの軽減ではすべて即座に最終状態、パネルは 0.3 秒以内のフェード', () => {
    const rm = buildResultTimeline({ short: false, reducedMotion: true, stamps: true });
    expect(rm.fade).toBeGreaterThan(0);
    expect(rm.fade).toBeLessThanOrEqual(REDUCED_MOTION_FADE);
    expect(rm.total).toBeLessThanOrEqual(REDUCED_MOTION_FADE);
    for (const s of [rm.panel, ...rm.meters, ...rm.stamps]) expect(s.duration).toBe(0);
  });

  it('時間はどれも有限で負にならない', () => {
    for (const tl of [first, short]) {
      for (const s of [tl.panel, ...tl.meters, ...tl.stamps]) {
        expect(s.start).toBeGreaterThanOrEqual(0);
        expect(s.duration).toBeGreaterThan(0);
        expect(Number.isFinite(spanEnd(s))).toBe(true);
      }
    }
  });
});
