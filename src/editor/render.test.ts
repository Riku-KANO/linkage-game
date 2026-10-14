import { describe, expect, it } from 'vitest';
import { analyzeMechanism, compileMechanism, sampleCycle } from '@/core/kinematics';
import { fourBar, jansenLeg } from '@/core/model/presets';
import {
  fmt1,
  footGuide,
  linkOutlineOrder,
  sampleRun,
  trajectoryExtent,
  trajectoryPaths,
} from './render';

const cam = { ox: 300, oy: 300, scale: 4 };

describe('trajectory paths', () => {
  it('draws a closed loop for a fully rotating mechanism', () => {
    const d = jansenLeg();
    const m = compileMechanism(d);
    const cyc = sampleCycle(m, 90);
    const p = trajectoryPaths(cyc, m.footIndex, cam);
    expect(p.fail).toBe('');
    // merged into a single sub-path
    expect(p.ok.match(/M/g)).toHaveLength(1);
    expect(p.ok.match(/L/g)!.length).toBe(90);
    expect(trajectoryExtent(cyc, m.footIndex)).toBeGreaterThan(35);
  });

  it('separates the unassemblable part of the cycle', () => {
    const d = fourBar(28, 35, 30, 40);
    const m = compileMechanism(d);
    const cyc = sampleCycle(m, 90);
    const p = trajectoryPaths(cyc, m.footIndex, cam);
    expect(p.ok.length).toBeGreaterThan(0);
    expect(p.fail.length).toBeGreaterThan(0);
  });
});

describe('link outline', () => {
  it('orders ternary link corners as a convex polygon', () => {
    const d = jansenLeg();
    const li = d.links.findIndex((l) => l.id === 'bde');
    expect(linkOutlineOrder(d, li)).toHaveLength(3);
    const bar = d.links.findIndex((l) => l.id === 'crank');
    expect(linkOutlineOrder(d, bar)).toHaveLength(2);
  });
});

describe('fmt1', () => {
  it('formats without negative zero', () => {
    expect(fmt1(-0.01)).toBe('0.0');
    expect(fmt1(12.345)).toBe('12.3');
  });
});

describe('foot guide', () => {
  it('measures the Jansen stride and lift and walks forward at the preset rpm', () => {
    const d = jansenLeg();
    const a = analyzeMechanism(d, { steps: 180 });
    const g = footGuide(a, d.motor.rpm)!;
    expect(g).not.toBeNull();
    expect(g.stride.length).toBeGreaterThan(35);
    expect(g.stride.x1 - g.stride.x0).toBeCloseTo(g.stride.length, 6);
    expect(g.lift.length).toBeGreaterThan(20);
    expect(g.contact.length).toBeGreaterThan(30);
    // the Jansen preset walks toward +x when turning clockwise (rpm < 0)
    expect(g.walk).toBe(1);
    expect(footGuide(a, -d.motor.rpm)!.walk).toBe(-1);
    expect(footGuide(a, 0)!.walk).toBe(0);
  });

  it('is null without a foot or crank', () => {
    const d = { ...jansenLeg(), foot: null };
    expect(footGuide(analyzeMechanism(d, { steps: 60 }), 30)).toBeNull();
  });

  it('wraps sample runs around the cycle', () => {
    expect(sampleRun(10, 8, 1)).toEqual([8, 9, 0, 1]);
    expect(sampleRun(10, 3, 3)).toEqual([3]);
  });
});
