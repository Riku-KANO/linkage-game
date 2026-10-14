import { describe, expect, it } from 'vitest';
import { MOTOR_MAX_RPM, motorParams, normalizeOptions, volumeToGain } from './mapping';

describe('volumeToGain(設定の音量 → 主音量)', () => {
  it('0 で無音、1 で等倍、範囲外は丸める', () => {
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(3)).toBe(1);
    expect(volumeToGain(Number.NaN)).toBe(0);
  });
  it('聴感に合わせて小音量側を細かくする(単調増加・下に凸)', () => {
    expect(volumeToGain(0.5)).toBeLessThan(0.5);
    let prev = -1;
    for (let v = 0; v <= 1; v += 0.05) {
      const g = volumeToGain(v);
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
  });
});

describe('normalizeOptions', () => {
  it('既定値は音量 1・速度 1・定位 0', () => {
    expect(normalizeOptions()).toEqual({ volume: 1, rate: 1, pan: 0 });
  });
  it('範囲外・NaN を安全な値に丸める', () => {
    expect(normalizeOptions({ volume: 5, rate: 100, pan: -9 })).toEqual({
      volume: 1,
      rate: 4,
      pan: -1,
    });
    expect(normalizeOptions({ volume: -1, rate: 0 })).toEqual({ volume: 0, rate: 0.25, pan: 0 });
    expect(normalizeOptions({ volume: Number.NaN, rate: Number.NaN, pan: Number.NaN })).toEqual({
      volume: 1,
      rate: 1,
      pan: 0,
    });
  });
});

describe('motorParams(モーターのうなり:rpm と負荷 → 音のパラメータ)', () => {
  it('rpm = 0 で無音', () => {
    expect(motorParams(0, 0).level).toBe(0);
    expect(motorParams(0, 1).level).toBe(0);
    expect(motorParams(Number.NaN, 0.5).level).toBe(0);
  });

  it('逆回転でも同じ音(|rpm| を使う)', () => {
    expect(motorParams(-60, 0.3)).toEqual(motorParams(60, 0.3));
  });

  it('音程は |rpm| に追従して単調に上がる', () => {
    let prev = motorParams(1, 0);
    for (let rpm = 5; rpm <= MOTOR_MAX_RPM; rpm += 5) {
      const p = motorParams(rpm, 0);
      expect(p.droneHz).toBeGreaterThan(prev.droneHz);
      expect(p.whineHz).toBeGreaterThan(prev.whineHz);
      expect(p.level).toBeGreaterThanOrEqual(prev.level);
      prev = p;
    }
  });

  it('上限の rpm を超えたら頭打ち', () => {
    expect(motorParams(500, 0.2)).toEqual(motorParams(MOTOR_MAX_RPM, 0.2));
  });

  it('負荷が増えるほどざらつき(粒・うなりの揺れ・明るさ)が増え、音程は少し下がる', () => {
    let prev = motorParams(60, 0);
    for (let load = 0.1; load <= 1.0001; load += 0.1) {
      const p = motorParams(60, load);
      expect(p.gritGain).toBeGreaterThan(prev.gritGain);
      expect(p.amDepth).toBeGreaterThan(prev.amDepth);
      expect(p.cutoffHz).toBeGreaterThan(prev.cutoffHz);
      expect(p.strainGain).toBeGreaterThanOrEqual(prev.strainGain);
      expect(p.droneHz).toBeLessThan(prev.droneHz);
      prev = p;
    }
  });

  it('負荷は 0..1 に丸める', () => {
    expect(motorParams(60, 7)).toEqual(motorParams(60, 1));
    expect(motorParams(60, -2)).toEqual(motorParams(60, 0));
  });

  it('音量・周波数は聞こえる範囲に収まり、振幅変調で負にならない', () => {
    for (let rpm = 0; rpm <= MOTOR_MAX_RPM; rpm += 10) {
      for (let load = 0; load <= 1; load += 0.25) {
        const p = motorParams(rpm, load);
        expect(p.level).toBeLessThanOrEqual(0.35);
        expect(p.droneHz).toBeGreaterThan(20);
        expect(p.whineHz).toBeLessThan(2000);
        expect(p.amDepth).toBeLessThanOrEqual(0.5);
        expect(p.amRate).toBeGreaterThan(0);
      }
    }
  });
});
