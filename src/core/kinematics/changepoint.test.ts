import { describe, expect, it } from 'vitest';
import { analyzeMechanism } from './analyze';
import { compileMechanism } from './compile';
import { extrapolatePose, sampleCycle, solvePose } from './solve';
import { jansenLeg } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';

/**
 * KIN-7 変位点(2 円が接する姿勢)を通るときの組立モード。
 * 平行四辺形は、クランクが地節と一直線になる角度で「平行四辺形」と「反平行四辺形」の 2 つの解が接する。
 */
function parallelogram(extraLink: boolean): DesignDoc {
  return {
    version: 1,
    name: extraLink ? '二重平行四辺形' : '平行四辺形',
    motor: { rpm: 30 },
    legs: { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false },
    foot: 'C',
    joints: [
      { id: 'O2', x: 0, y: 0, fixed: true },
      { id: 'O4', x: 40, y: 0, fixed: true },
      { id: 'O6', x: 20, y: 0, fixed: true },
      { id: 'A', x: 0, y: 10, fixed: false },
      { id: 'B', x: 40, y: 10, fixed: false },
      { id: 'C', x: 20, y: 10, fixed: false },
    ],
    links: [
      { id: 'crank', joints: ['O2', 'A'] },
      { id: 'coupler', joints: ['A', 'C', 'B'] },
      { id: 'rocker', joints: ['O4', 'B'] },
      ...(extraLink ? [{ id: 'mid', joints: ['O6', 'C'] }] : []),
    ],
    cranks: [{ id: 'm', link: 'crank', pivot: 'O2', phase: 0 }],
  };
}

describe('change points (KIN-7)', () => {
  it('a parallelogram stays a parallelogram through the change point (velocity continuity)', () => {
    const m = compileMechanism(parallelogram(false));
    const A = m.jointIndex.get('A')!;
    const B = m.jointIndex.get('B')!;
    const cyc = sampleCycle(m, 360);
    expect(cyc.fullRotation).toBe(true);
    for (const p of cyc.positions) {
      // the coupler only translates: B is always A + (40, 0)
      expect(p[B * 2]! - p[A * 2]!).toBeCloseTo(40, 6);
      expect(p[B * 2 + 1]! - p[A * 2 + 1]!).toBeCloseTo(0, 6);
    }
  });

  it('a double parallelogram (Grübler 0, special geometry) turns fully', () => {
    const a = analyzeMechanism(parallelogram(true));
    expect(a.dof).toBe(0);
    expect(a.fullRotation).toBe(true);
    expect(a.failAngles).toEqual([]);
    expect(a.specialGeometry).toBe(true);
    expect(a.messages.map((x) => x.key)).toContain('analysis.specialGeometry');
  });

  it('the redundant link picks the branch even without a prediction (slider jumps)', () => {
    const m = compileMechanism(parallelogram(true));
    // step across the change point at 90° (crank along the ground line) with only `prev`
    let prev: Float64Array | null = null;
    for (let deg = 60; deg <= 130; deg += 7) {
      const res = solvePose(m, (deg * Math.PI) / 180, { prev });
      expect(res.ok, `${deg}°`).toBe(true);
      prev = res.positions;
    }
  });

  it('a genuinely braced mechanism still locks (chapter 2 lesson)', () => {
    const base = jansenLeg();
    const braced: DesignDoc = {
      ...base,
      links: [...base.links, { id: 'brace', joints: ['C', 'E'] }],
    };
    const a = analyzeMechanism(braced);
    expect(a.dof).toBe(0);
    expect(a.fullRotation).toBe(false);
    expect(a.specialGeometry).toBe(false);
  });

  it('prediction does not change regular mechanisms', () => {
    const m = compileMechanism(jansenLeg());
    const cyc = sampleCycle(m, 180);
    let prev: Float64Array | null = null;
    for (let s = 0; s < 180; s++) {
      const res = solvePose(m, cyc.thetas[s]!, { prev });
      for (let i = 0; i < res.positions.length; i++) {
        expect(res.positions[i]).toBeCloseTo(cyc.positions[s]![i]!, 12);
      }
      prev = res.positions;
    }
  });

  it('extrapolates linearly from the last two poses', () => {
    const out = new Float64Array(2);
    extrapolatePose(new Float64Array([1, 2]), new Float64Array([0, 1]), 1, out);
    expect([...out]).toEqual([2, 3]);
    extrapolatePose(new Float64Array([1, 2]), new Float64Array([0, 1]), 0.5, out);
    expect([...out]).toEqual([1.5, 2.5]);
  });
});
