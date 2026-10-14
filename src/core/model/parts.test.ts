import { describe, expect, it } from 'vitest';
import { computeBill, linkLengthCm } from './parts';
import { fourBar, jansenLeg, jansenWalker } from './presets';
import { legInstances, mirrorDesignX } from '@/core/kinematics/legs';
import { compileMechanism } from '@/core/kinematics/compile';
import { solvePose } from '@/core/kinematics/solve';

describe('bill of materials (E-07)', () => {
  it('measures multi-joint links by their spanning tree', () => {
    expect(
      linkLengthCm([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ]),
    ).toBeCloseTo(5);
    expect(
      linkLengthCm([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 0 },
      ]),
    ).toBeCloseTo(10);
  });
  it('counts parts of a four-bar', () => {
    const b = computeBill(fourBar());
    // 3 links, pins: O2(1) O4(1) A(1) B(1) = 4, fixed 2, crank 1
    expect(b.perLeg.links).toBe(3);
    expect(b.perLeg.pins).toBe(4);
    expect(b.parts).toBe(3 + 4 + 2 + 1);
  });
  it('multiplies cost by leg instances but shares the crank', () => {
    const one = computeBill(jansenLeg());
    const many = computeBill(jansenWalker());
    expect(many.instances).toBe(12);
    expect(many.parts).toBe(one.parts);
    // 片脚のコストは 0.1 単位に丸めてあるので、12 倍すると最大 0.6 ずれる
    expect(Math.abs(many.cost - ((one.cost - 30) * 12 + 30))).toBeLessThan(1);
  });
});

describe('leg array (E-06)', () => {
  it('lays out instances symmetrically with phase steps', () => {
    const inst = legInstances(jansenWalker());
    expect(inst).toHaveLength(12);
    expect(inst[0]!.z).toBeCloseTo(-inst[11]!.z);
    expect(inst.filter((i) => i.mirrored)).toHaveLength(6);
    expect(inst[2]!.phase).toBeCloseTo((120 * Math.PI) / 180);
  });
  it('mirrored legs share the crank pin', () => {
    const d = jansenLeg();
    const m = mirrorDesignX(d);
    const a = compileMechanism(d);
    const b = compileMechanism(m);
    const A = a.jointIndex.get('A')!;
    for (const th of [0, 1, 2.5, 4]) {
      const pa = solvePose(a, th).positions;
      const pb = solvePose(b, th).positions;
      expect(pb[A * 2]).toBeCloseTo(pa[A * 2]!, 9);
      expect(pb[A * 2 + 1]).toBeCloseTo(pa[A * 2 + 1]!, 9);
      expect(solvePose(b, th).ok).toBe(true);
    }
  });
});
