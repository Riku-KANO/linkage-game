import { describe, expect, it } from 'vitest';
import { fillNoise, mulberry32 } from './rng';

describe('mulberry32', () => {
  it('同じシードなら同じ列を返す', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('シードが違えば列も違う', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const same = Array.from({ length: 20 }, () => a() === b()).filter(Boolean).length;
    expect(same).toBeLessThan(2);
  });

  it('[0, 1) に一様に散らばる', () => {
    const r = mulberry32(7);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
  });
});

describe('fillNoise', () => {
  it('白色雑音は決定論的で、-1..1、平均ほぼ 0', () => {
    const a = new Float32Array(48000);
    const b = new Float32Array(48000);
    fillNoise(a, 99, 'white');
    fillNoise(b, 99, 'white');
    expect(a).toEqual(b);
    let sum = 0;
    for (const v of a) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      sum += v;
    }
    expect(Math.abs(sum / a.length)).toBeLessThan(0.02);
  });

  it('パチパチ雑音はまばらな粒(ほとんどが 0)', () => {
    const a = new Float32Array(48000);
    fillNoise(a, 3, 'crackle');
    const nonZero = a.filter((v) => v !== 0).length;
    expect(nonZero).toBeGreaterThan(100);
    expect(nonZero).toBeLessThan(a.length * 0.1);
    for (const v of a) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('ループのつなぎ目で段差が出ないよう両端が 0 付近に収まる', () => {
    const a = new Float32Array(4800);
    fillNoise(a, 5, 'white');
    expect(Math.abs(a[0]!)).toBeLessThan(0.05);
    expect(Math.abs(a[a.length - 1]!)).toBeLessThan(0.05);
  });
});
