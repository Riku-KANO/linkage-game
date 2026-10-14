import { describe, expect, it } from 'vitest';
import { poseRate } from './poseRate';
import { compileMechanism } from '@/core/kinematics/compile';
import { solvePose } from '@/core/kinematics/solve';
import { mirrorDesignX } from '@/core/kinematics/legs';
import { chebyshevLambda, fourBar, jansenLeg } from '@/core/model/presets';

describe('poseRate (dp/dθ used by the motor and contact velocities)', () => {
  it('matches a branch-consistent central difference', () => {
    const h = 1e-5;
    for (const d of [jansenLeg(), mirrorDesignX(jansenLeg()), chebyshevLambda(), fourBar()]) {
      const mech = compileMechanism(d);
      let prev: Float64Array | null = null;
      for (let s = 0; s < 24; s++) {
        const th = -(2 * Math.PI * s) / 24;
        const pose: Float64Array = new Float64Array(solvePose(mech, th, { prev }).positions);
        prev = pose;
        const out = new Float64Array(pose.length);
        const max = poseRate(mech, th, pose, out);
        const p = solvePose(mech, th + h, { prev: pose }).positions;
        const m = solvePose(mech, th - h, { prev: pose }).positions;
        let fdMax = 0;
        for (let i = 0; i < pose.length; i++) {
          const fd = (p[i]! - m[i]!) / (2 * h);
          expect(out[i]).toBeCloseTo(fd, 3);
          if (!mech.fixed[i >> 1]) fdMax = Math.max(fdMax, Math.abs(fd));
        }
        expect(max).toBeGreaterThanOrEqual(fdMax - 1e-3);
      }
    }
  });
});
