import { describe, expect, it } from 'vitest';
import { runHeadless } from './headless';
import { createFlatTerrain } from './terrain';
import { jammingFourBar, jansenTwoSided } from './fixtures';
import { jansenWalker } from '@/core/model/presets';
import { compileMechanism } from '@/core/kinematics/compile';
import { solvePose } from '@/core/kinematics/solve';

const flat = createFlatTerrain(0);
const start = { x: 0, z: 0 };

describe('runHeadless (SIM-6)', () => {
  it('returns a summary and a 10 Hz pose trace', () => {
    const res = runHeadless({ design: jansenTwoSided(), terrain: flat, start }, { maxTime: 3 });
    expect(res.time).toBeCloseTo(3, 9);
    expect(res.trace.length).toBe(31);
    res.trace.forEach((p, i) => expect(p.time).toBeCloseTo(i * 0.1, 9));
    expect(res.trace[0]!.position.x).toBeCloseTo(0, 12);
    expect(res.distance).toBeGreaterThan(0.5);
    expect(res.reachedGoal).toBe(false);
    expect(res.goalTime).toBeNull();
    expect(res.energy).toBeGreaterThan(0);
    expect(res.fallen).toBe(false);
    // at most the landing transient at t ≈ 0.03 s
    expect(res.stallTime).toBeLessThan(0.05);
    expect(res.stalled).toBe(false);
  });

  it('stops when the COM reaches the goal', () => {
    const res = runHeadless(
      { design: jansenTwoSided(), terrain: flat, start },
      { maxTime: 20, goalX: 1.5 },
    );
    expect(res.reachedGoal).toBe(true);
    expect(res.goalTime).not.toBeNull();
    expect(res.time).toBe(res.goalTime);
    expect(res.time).toBeLessThan(10);
    expect(res.distance).toBeGreaterThan(1.4);
  });

  it('stops early on a jammed mechanism', () => {
    const res = runHeadless({ design: jammingFourBar(), terrain: flat, start }, { maxTime: 20 });
    expect(res.jammed).toBe(true);
    expect(res.time).toBeLessThan(5);
  });

  it('stops after a stall timeout', () => {
    const res = runHeadless(
      { design: jansenTwoSided(), terrain: flat, start, params: { motor: { stallTorque: 3 } } },
      { maxTime: 20, stallTimeout: 1 },
    );
    expect(res.stalled).toBe(true);
    expect(res.stallTime).toBeGreaterThanOrEqual(1);
    expect(res.time).toBeLessThan(5);
  });

  it('the trace replays the legs through kinematics (ghost)', () => {
    const design = jansenTwoSided();
    const res = runHeadless({ design, terrain: flat, start }, { maxTime: 1 });
    const mech = compileMechanism(design);
    const last = res.trace[res.trace.length - 1]!;
    expect(solvePose(mech, last.motorAngle).ok).toBe(true);
    expect(last.motorAngle).toBeLessThan(0);
  });

  it('perf: 30 s of the Jansen walker runs in well under 1 s in Node', () => {
    for (const design of [jansenWalker(), jansenTwoSided()]) {
      const t0 = performance.now();
      const res = runHeadless({ design, terrain: flat, start }, { maxTime: 30, stopOnFail: false });
      const ms = performance.now() - t0;
      expect(res.time).toBeCloseTo(30, 6);
      expect(ms).toBeLessThan(1000);
    }
  });
});
