import { describe, expect, it } from 'vitest';
import { compileMechanism, sampleCycle, solvePose } from '@/core/kinematics';
import { fourBar, jansenLeg } from '@/core/model/presets';
import { MotionEngine, interpolateCycle, nearestSample, wrapAngle } from './motion';

function engineFor(design = fourBar(), rpm = 60) {
  const mech = compileMechanism(design);
  const cycle = sampleCycle(mech, 180);
  const e = new MotionEngine();
  e.setMechanism(mech, cycle, rpm);
  return { e, mech, cycle };
}

describe('MotionEngine', () => {
  it('advances the motor angle at the design rpm', () => {
    const { e } = engineFor(fourBar(), 60); // 1 rev/s
    let t = 0;
    e.tick(t);
    for (let i = 0; i < 15; i++) {
      t += 1000 / 60;
      e.tick(t);
    }
    expect(e.theta).toBeCloseTo((2 * Math.PI * 15) / 60, 3);
  });

  it('runs counter-clockwise for negative rpm', () => {
    const { e } = engineFor(jansenLeg(), -40);
    e.tick(0);
    e.tick(17);
    expect(e.theta).toBeLessThan(0);
  });

  it('caps at 60 fps (frames closer than ~16 ms are skipped)', () => {
    const { e } = engineFor();
    e.tick(0);
    e.tick(17);
    const th = e.theta;
    expect(e.tick(20)).toBe(false);
    expect(e.theta).toBe(th);
    expect(e.tick(34)).toBe(true);
    expect(e.theta).toBeGreaterThan(th);
  });

  it('does not move while paused, and setTheta solves the pose at that angle', () => {
    const { e, mech } = engineFor();
    e.setPlaying(false);
    e.tick(0);
    e.tick(100);
    expect(e.theta).toBe(0);
    e.setTheta(1.2);
    const ref = solvePose(mech, 1.2);
    expect(e.pose?.ok).toBe(true);
    for (let i = 0; i < ref.positions.length; i++)
      expect(e.pose!.positions[i]).toBeCloseTo(ref.positions[i]!, 6);
  });

  it('notifies frame subscribers and state subscribers', () => {
    const { e } = engineFor();
    let frames = 0;
    let states = 0;
    const off1 = e.subscribe(() => frames++);
    const off2 = e.subscribeState(() => states++);
    e.tick(0);
    e.tick(17);
    expect(frames).toBe(1);
    e.toggle();
    expect(states).toBe(1);
    expect(e.isPlaying()).toBe(false);
    off1();
    off2();
    e.toggle();
    e.tick(40);
    expect(frames).toBe(1);
  });

  it('trial motion turns the crank exactly once even when paused', () => {
    const { e } = engineFor(fourBar(), 30);
    e.setPlaying(false);
    e.setTheta(0.5);
    e.startTrial(1);
    expect(e.isTrialRunning()).toBe(true);
    let t = 0;
    for (let i = 0; i <= 70; i++, t += 17) e.tick(t);
    expect(e.isTrialRunning()).toBe(false);
    expect(e.theta).toBeCloseTo(0.5 + 2 * Math.PI, 6);
    expect(e.isPlaying()).toBe(false);
  });

  it('keeps the assembly branch of the sampled cycle after a design change', () => {
    const { e, cycle } = engineFor(jansenLeg(), -40);
    e.setPlaying(false);
    e.setTheta(2.0);
    const k = nearestSample(cycle, 2.0);
    const ref = cycle.positions[k]!;
    const pos = e.pose!.positions;
    // the pose at 2.0 rad is within a degree of the sampled one
    for (let i = 0; i < ref.length; i++) expect(Math.abs(pos[i]! - ref[i]!)).toBeLessThan(1.5);
  });

  it('drives a requestAnimationFrame loop only while playing', () => {
    const { e } = engineFor();
    const queue: ((t: number) => void)[] = [];
    e.start(
      (cb) => {
        queue.push(cb);
        return queue.length;
      },
      () => {},
    );
    expect(queue).toHaveLength(1);
    queue.shift()!(0);
    expect(queue).toHaveLength(1);
    e.setPlaying(false);
    queue.shift()!(17);
    expect(queue).toHaveLength(0);
    e.stop();
  });
});

describe('angle helpers', () => {
  it('wraps angles to [0, 2π)', () => {
    expect(wrapAngle(-0.1)).toBeCloseTo(2 * Math.PI - 0.1);
    expect(wrapAngle(7)).toBeCloseTo(7 - 2 * Math.PI);
  });
});

describe('interpolateCycle', () => {
  it('matches the solver between samples', () => {
    const mech = compileMechanism(jansenLeg());
    const cycle = sampleCycle(mech, 180);
    const th = 1.234;
    const p = interpolateCycle(cycle, mech.footIndex, th)!;
    const ref = solvePose(mech, th, { prev: cycle.positions[nearestSample(cycle, th)]! });
    expect(p.x).toBeCloseTo(ref.positions[mech.footIndex * 2]!, 0);
    expect(p.y).toBeCloseTo(ref.positions[mech.footIndex * 2 + 1]!, 0);
    const p0 = interpolateCycle(cycle, mech.footIndex, -2 * Math.PI)!;
    expect(p0.x).toBeCloseTo(cycle.positions[0]![mech.footIndex * 2]!, 9);
  });
});
