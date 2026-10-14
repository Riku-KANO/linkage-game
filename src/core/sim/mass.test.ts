import { describe, expect, it } from 'vitest';
import { computeMassModel, jointMasses } from './mass';
import { compileMechanism } from '@/core/kinematics/compile';
import { legInstances, mirrorDesignX } from '@/core/kinematics/legs';
import { computeBill } from '@/core/model/parts';
import { chebyshevLambda, fourBar, jansenLeg, jansenWalker } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';
import { jansenOneSided, jansenTwoSided } from './fixtures';

function model(design: DesignDoc, chassisMass = 8) {
  const instances = legInstances(design);
  const normal = compileMechanism(design);
  const mirrored = compileMechanism(mirrorDesignX(design));
  const mechs = instances.map((i) => (i.mirrored ? mirrored : normal));
  return computeMassModel(design, instances, mechs, chassisMass);
}

describe('mass model (SIM-2)', () => {
  it('lumps exactly the bill-of-materials leg mass onto the joints', () => {
    for (const d of [jansenLeg(), chebyshevLambda(), fourBar()]) {
      const sum = jointMasses(d).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(computeBill(d).perLeg.mass, 3);
    }
  });

  it('total mass = computeBill mass + chassis mass', () => {
    for (const d of [jansenWalker(), jansenTwoSided(), fourBar()]) {
      const m = model(d, 8);
      expect(m.total).toBeCloseTo(computeBill(d).mass + 8, 2);
    }
  });

  it('puts the COM of a left/right symmetric machine on the center plane', () => {
    const m = model(jansenTwoSided());
    expect(Math.abs(m.com[2])).toBeLessThan(1e-9);
    // mirrored pairs balance front/back around the crank axis
    expect(Math.abs(m.com[0])).toBeLessThan(0.01);
    // below the crank axis (legs hang down)
    expect(m.com[1]).toBeLessThan(0);
  });

  it('has a symmetric positive-definite inertia tensor', () => {
    const I = model(jansenWalker()).inertia;
    expect(I[1]).toBeCloseTo(I[3]!, 12);
    expect(I[2]).toBeCloseTo(I[6]!, 12);
    expect(I[5]).toBeCloseTo(I[7]!, 12);
    // leading principal minors
    expect(I[0]).toBeGreaterThan(0);
    expect(I[0]! * I[4]! - I[1]! * I[3]!).toBeGreaterThan(0);
    // physical tensors satisfy the triangle inequality of the diagonal moments
    expect(I[0]! + I[4]!).toBeGreaterThanOrEqual(I[8]!);
    expect(I[4]! + I[8]!).toBeGreaterThanOrEqual(I[0]!);
    expect(I[8]! + I[0]!).toBeGreaterThanOrEqual(I[4]!);
  });

  it('builds a chassis box around the fixed points and the leg rows', () => {
    const m = model(jansenOneSided());
    // Jansen fixed points: O(0,0), B(-38,-7.8) and the mirrored B(38,-7.8)
    expect(m.chassisMin[0]).toBeCloseTo(-0.43, 6);
    expect(m.chassisMax[0]).toBeCloseTo(0.43, 6);
    expect(m.chassisMin[1]).toBeCloseTo(-0.128, 6);
    expect(m.chassisMax[2]).toBeCloseTo(0.6, 6);
  });
});
