import { describe, expect, it } from 'vitest';
import { CM } from '@/core/model/types';
import { jansenLeg, jansenWalker } from '@/core/model/presets';
import { mirrorDesignX } from '@/core/kinematics/legs';
import { createLegSolver } from '@/testrun/legs';
import { buildLegSweeps, restingBodyY, sampleSweep, wrapAngle } from './poses';

describe('wrapAngle', () => {
  it('wraps into (−π, π]', () => {
    expect(wrapAngle(0)).toBeCloseTo(0);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle((4 * Math.PI) / 3)).toBeCloseTo((-2 * Math.PI) / 3);
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5);
  });
});

describe('buildLegSweeps', () => {
  it('starts at the drawn design pose and ends at the test-run start pose', () => {
    const design = jansenWalker();
    const sw = buildLegSweeps(design);
    const solver = createLegSolver(design);
    solver.solve(0);
    const normal = design.joints.flatMap((j) => [j.x, j.y]);
    const mirrored = mirrorDesignX(design).joints.flatMap((j) => [j.x, j.y]);
    const out = new Float64Array(sw.n2);
    sw.instances.forEach((inst, k) => {
      sampleSweep(sw, k, 0, out);
      const start = inst.mirrored ? mirrored : normal;
      start.forEach((v, i) => expect(out[i]).toBeCloseTo(v, 6));
      sampleSweep(sw, k, 1, out);
      solver.positions[k]!.forEach((v, i) => expect(out[i]).toBeCloseTo(v, 6));
    });
  });

  it('turns the crank instead of stretching the bars', () => {
    const design = jansenWalker();
    const sw = buildLegSweeps(design);
    const idx = new Map(design.joints.map((j, i) => [j.id, i]));
    const bars = design.links
      .filter((l) => l.joints.length === 2)
      .map((l) => [idx.get(l.joints[0]!)!, idx.get(l.joints[1]!)!] as const);
    const out = new Float64Array(sw.n2);
    for (let k = 0; k < sw.instances.length; k++) {
      sampleSweep(sw, k, 0, out);
      const len0 = bars.map(([a, b]) =>
        Math.hypot(out[a * 2]! - out[b * 2]!, out[a * 2 + 1]! - out[b * 2 + 1]!),
      );
      for (const s of [0.25, 0.5, 0.75]) {
        sampleSweep(sw, k, s, out);
        bars.forEach(([a, b], i) => {
          const len = Math.hypot(out[a * 2]! - out[b * 2]!, out[a * 2 + 1]! - out[b * 2 + 1]!);
          // 表の間の線形補間なので、ごくわずかに縮むだけ
          expect(Math.abs(len - len0[i]!)).toBeLessThan(0.6);
        });
      }
    }
  });

  it('keeps a single leg with no phase still', () => {
    const design = jansenLeg();
    const sw = buildLegSweeps(design);
    expect(sw.instances).toHaveLength(1);
    const a = sampleSweep(sw, 0, 0, new Float64Array(sw.n2));
    const b = sampleSweep(sw, 0, 0.5, new Float64Array(sw.n2));
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 6));
  });

  it('rests the machine with its lowest point one foot radius above the ground', () => {
    const design = jansenWalker();
    const sw = buildLegSweeps(design);
    let minY = Infinity;
    sw.end.forEach((p) => {
      for (let j = 1; j < p.length; j += 2) minY = Math.min(minY, p[j]! * CM);
    });
    expect(restingBodyY(sw, 0.03) + minY).toBeCloseTo(0.03 + 0.02, 9);
  });
});
