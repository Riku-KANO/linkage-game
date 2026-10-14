import { describe, expect, it } from 'vitest';
import { SPRINGS } from '@/ui/tokens';
import { damp, springStep } from './spring';

describe('springStep', () => {
  it('カメラのばね(臨界減衰に近い)は 1 秒で目標に落ち着き、ほとんど行き過ぎない', () => {
    const s = { x: 0, v: 0 };
    let maxX = 0;
    for (let i = 0; i < 60; i++) {
      springStep(s, 1, SPRINGS.camera, 1 / 60);
      maxX = Math.max(maxX, s.x);
    }
    expect(s.x).toBeCloseTo(1, 2);
    expect(maxX).toBeLessThan(1.01);
  });

  it('フレームレートが違っても同じ所へ行く', () => {
    const a = { x: 0, v: 0 };
    const b = { x: 0, v: 0 };
    for (let i = 0; i < 30; i++) springStep(a, 1, SPRINGS.follow, 1 / 30);
    for (let i = 0; i < 144; i++) springStep(b, 1, SPRINGS.follow, 1 / 144);
    expect(a.x).toBeCloseTo(b.x, 2);
  });

  it('巨大な dt(タブ復帰など)でも発散しない', () => {
    const s = { x: 0, v: 0 };
    springStep(s, 1, SPRINGS.ui, 5);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(2);
  });
});

describe('damp', () => {
  it('dt を分けても同じ結果', () => {
    const one = damp(0, 1, 4, 0.2);
    const two = damp(damp(0, 1, 4, 0.1), 1, 4, 0.1);
    expect(one).toBeCloseTo(two, 12);
  });
});
