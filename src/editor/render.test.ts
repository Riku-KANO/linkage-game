import { describe, expect, it } from 'vitest';
import { compileMechanism, sampleCycle } from '@/core/kinematics';
import { fourBar, jansenLeg } from '@/core/model/presets';
import { fmt1, linkOutlineOrder, trajectoryExtent, trajectoryPaths } from './render';

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
