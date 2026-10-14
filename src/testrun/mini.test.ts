import { describe, expect, it } from 'vitest';
import { chebyshevLambda, createEmptyDesign, jansenWalker } from '@/core/model';
import { buildMiniModel, crankAngleDeg } from './mini';

describe('buildMiniModel', () => {
  it('covers the whole motion and draws the closed foot curve', () => {
    const d = jansenWalker();
    const m = buildMiniModel(d);
    const [x, y, w, h] = m.viewBox;
    for (const j of d.joints) {
      expect(j.x).toBeGreaterThanOrEqual(x);
      expect(j.x).toBeLessThanOrEqual(x + w);
      expect(-j.y).toBeGreaterThanOrEqual(y);
      expect(-j.y).toBeLessThanOrEqual(y + h);
    }
    expect(m.footPath.startsWith('M')).toBe(true);
    expect(m.footPath.endsWith('Z')).toBe(true);
    expect(m.bars).toHaveLength(5);
    expect(m.plates).toHaveLength(2);
    expect(m.plates.every((p) => p.joints.length === 3)).toBe(true);
    expect(m.fixed.map((i) => d.joints[i]!.id).sort()).toEqual(['B', 'O']);
    expect(m.crank && d.joints[m.crank.pivot]!.id).toBe('O');
    expect(m.stroke).toBeGreaterThan(0);
  });

  it('reports the crank direction in degrees', () => {
    const d = chebyshevLambda();
    const m = buildMiniModel(d);
    // 設計姿勢:クランク O2(0,0) → A(10,0) は 0°
    expect(crankAngleDeg(m, m.designPos)).toBeCloseTo(0);
    const pos = Float64Array.from(m.designPos);
    const a = m.crank!.pin;
    pos[a * 2] = 0;
    pos[a * 2 + 1] = -10;
    expect(crankAngleDeg(m, pos)).toBeCloseTo(270);
  });

  it('copes with an empty design', () => {
    const m = buildMiniModel(createEmptyDesign());
    expect(m.footPath).toBe('');
    expect(m.crank).toBeNull();
    expect(m.viewBox[2]).toBeGreaterThan(0);
    expect(crankAngleDeg(m, m.designPos)).toBeNull();
  });
});
