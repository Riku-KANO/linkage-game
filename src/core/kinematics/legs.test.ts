import { describe, expect, it } from 'vitest';
import { compileLegSet, legMechanism, legTheta, solveLegInstances } from './legs';
import { compileMechanism } from './compile';
import { analyzeMechanism } from './analyze';
import { poseDerivative, sampleCycle } from './solve';
import { jansenLeg, jansenWalker, fourBar } from '@/core/model/presets';

describe('leg set solving (E-06)', () => {
  it('compiles normal and mirrored mechanisms once and shares them between instances', () => {
    const set = compileLegSet(jansenWalker());
    expect(set.instances).toHaveLength(6);
    expect(set.mirrored).not.toBeNull();
    set.instances.forEach((inst, k) => {
      expect(legMechanism(set, k)).toBe(inst.mirrored ? set.mirrored : set.normal);
    });
    expect(compileLegSet(fourBar()).mirrored).toBeNull();
  });

  it('solves every instance at its own phase, matching a continuous single-leg sweep', () => {
    const d = jansenWalker();
    const set = compileLegSet(d);
    const single = compileMechanism(d);
    const cyc = sampleCycle(single, 360);
    for (let s = 0; s < 360; s += 7) {
      const th = cyc.thetas[s]!;
      expect(solveLegInstances(set, th)).toBe(true);
      set.instances.forEach((inst, k) => {
        if (inst.mirrored) return;
        // 位相 φ の組は、単脚の θ + φ の姿勢と同じ
        const steps = Math.round(((th + inst.phase) / (2 * Math.PI)) * 360) % 360;
        const ref = cyc.positions[steps]!;
        const pos = set.positions[k]!;
        for (let i = 0; i < pos.length; i++) expect(pos[i]).toBeCloseTo(ref[i]!, 6);
      });
    }
  });

  it('keeps the crank pins of mirrored pairs together', () => {
    const set = compileLegSet(jansenWalker());
    const A = set.normal.jointIndex.get('A')!;
    for (const th of [0, 1, 2.5, 4, 6]) {
      solveLegInstances(set, th);
      for (let g = 0; g < 3; g++) {
        const a = set.positions[g * 2]!;
        const b = set.positions[g * 2 + 1]!;
        expect(b[A * 2]).toBeCloseTo(a[A * 2]!, 9);
        expect(b[A * 2 + 1]).toBeCloseTo(a[A * 2 + 1]!, 9);
      }
    }
  });

  it('follows the assembly branch across large jumps of the motor angle', () => {
    const set = compileLegSet(jansenLeg());
    const ref = compileLegSet(jansenLeg());
    // ref は細かく回し、set は 1 回で大きく飛ばす
    for (let s = 0; s <= 100; s++) solveLegInstances(ref, (s / 100) * 5);
    solveLegInstances(set, 0);
    solveLegInstances(set, 5);
    const a = set.positions[0]!;
    const b = ref.positions[0]!;
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i]!, 6);
    expect(set.theta).toBe(5);
  });

  it('optionally fills dp/dθ for every instance', () => {
    const set = compileLegSet(jansenWalker());
    solveLegInstances(set, 1.2, { derivatives: true });
    set.instances.forEach((_, k) => {
      const mech = legMechanism(set, k);
      const expected = poseDerivative(mech, legTheta(set, k, 1.2), set.positions[k]!);
      expect(Array.from(set.derivatives[k]!)).toEqual(Array.from(expected));
    });
  });

  it('reports instances that cannot be assembled', () => {
    const d = { ...fourBar(28, 35, 30, 40), legs: { ...jansenLeg().legs, count: 2 } };
    const set = compileLegSet(d);
    expect(solveLegInstances(set, 0)).toBe(true);
    const bad = analyzeMechanism(d).failAngles[0]!;
    expect(solveLegInstances(set, bad)).toBe(false);
    expect(set.ok).toEqual([false, false]);
  });
});
