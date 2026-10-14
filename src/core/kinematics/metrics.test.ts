import { describe, expect, it } from 'vitest';
import { footMetrics, walkDirection } from './metrics';
import { compileMechanism } from './compile';
import { sampleCycle } from './solve';
import { analyzeMechanism } from './analyze';
import { mirrorDesignX } from './legs';
import { fourBar, jansenLeg } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';
import { hasKey } from '@/i18n';

function metricsOf(d: DesignDoc, steps = 180, direction: 1 | -1 = 1) {
  const m = compileMechanism(d);
  return footMetrics(sampleCycle(m, steps, { direction }), m.footIndex);
}

describe('footMetrics (E-03)', () => {
  it('measures the Jansen stride, lift, flatness and duty', () => {
    const f = metricsOf(jansenLeg());
    expect(f.stride).toBeGreaterThan(35);
    expect(f.flatness).toBeLessThan(0.5);
    expect(f.lift).toBeGreaterThan(20);
    expect(f.duty).toBeGreaterThan(0.3);
    expect(f.duty).toBeLessThan(0.6);
    expect(f.minY).toBeCloseTo(-91.8, 0);
    expect(f.contactStart).toBeGreaterThanOrEqual(0);
    expect(f.contactEnd).toBeGreaterThanOrEqual(0);
  });

  it('does not depend much on the sample count', () => {
    const a = metricsOf(jansenLeg(), 180);
    const b = metricsOf(jansenLeg(), 720);
    expect(Math.abs(a.stride - b.stride)).toBeLessThan(1.5);
    expect(Math.abs(a.lift - b.lift)).toBeLessThan(0.05);
    expect(Math.abs(a.duty - b.duty)).toBeLessThan(0.02);
  });

  it('reports a curved four-bar path as not flat', () => {
    const f = metricsOf(fourBar());
    expect(f.flatness).toBeGreaterThan(1);
  });

  it('knows the Jansen leg walks +x when turned clockwise (rpm < 0)', () => {
    const d = jansenLeg();
    expect(d.motor.rpm).toBeLessThan(0);
    const f = metricsOf(d);
    // θ が増える向き(反時計回り)では脚先は接地中に +x へ動くので、機体は −x へ進む
    expect(f.direction).toBe(-1);
    expect(walkDirection(f, d.motor.rpm)).toBe(1);
    expect(walkDirection(f, 40)).toBe(-1);
    expect(walkDirection(f, 0)).toBe(0);
  });

  it('gives the same direction for a cycle sampled backwards', () => {
    const f = metricsOf(jansenLeg(), 180, -1);
    expect(f.direction).toBe(-1);
    expect(f.stride).toBeGreaterThan(35);
  });

  it('mirrored Jansen legs walk the same way (they share the crank)', () => {
    const d = jansenLeg();
    const f = metricsOf(mirrorDesignX(d));
    expect(walkDirection(f, d.motor.rpm)).toBe(1);
    expect(f.stride).toBeGreaterThan(35);
  });

  it('returns empty metrics without a foot', () => {
    const d = { ...jansenLeg(), foot: null };
    const f = metricsOf(d);
    expect(f).toMatchObject({ stride: 0, lift: 0, duty: 0, direction: 0, contactStart: -1 });
  });

  it('is exposed on the mechanism analysis', () => {
    const a = analyzeMechanism(jansenLeg());
    expect(a.foot?.stride).toBeGreaterThan(35);
    for (const k of ['stride', 'lift', 'flatness', 'duty']) {
      expect(hasKey(`analysis.metric.${k}`), k).toBe(true);
    }
  });
});
