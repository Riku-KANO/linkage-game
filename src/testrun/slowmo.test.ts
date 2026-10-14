import { describe, expect, it } from 'vitest';
import {
  createSlowMoState,
  DEFAULT_SLOWMO,
  isFallStarting,
  isSlowMoActive,
  resetSlowMo,
  tiltFromQuat,
  updateSlowMo,
  type FallSignal,
} from './slowmo';

const P = DEFAULT_SLOWMO;
const deg = (d: number) => (d * Math.PI) / 180;

describe('tiltFromQuat', () => {
  it('is 0 upright and the rotation angle for pitch/roll; yaw does not tilt', () => {
    expect(tiltFromQuat({ x: 0, y: 0, z: 0, w: 1 })).toBeCloseTo(0);
    const a = deg(30);
    expect(tiltFromQuat({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) })).toBeCloseTo(a);
    expect(tiltFromQuat({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) })).toBeCloseTo(a);
    expect(tiltFromQuat({ x: 0, y: Math.sin(1), z: 0, w: Math.cos(1) })).toBeCloseTo(0);
    expect(tiltFromQuat({ x: 1, y: 0, z: 0, w: 0 })).toBeCloseTo(Math.PI);
  });
});

/** 歩行中の揺れ(±5°、2Hz)をシミュレーション時間で作り、60fps で流す */
function walkSignals(seconds: number): FallSignal[] {
  const out: FallSignal[] = [];
  const amp = deg(5);
  const w = 2 * Math.PI * 2;
  for (let i = 0; i < seconds * 60; i++) {
    const t = i / 60;
    out.push({
      tilt: Math.abs(amp * Math.sin(w * t)),
      tiltRate: amp * w * Math.cos(w * t) * Math.sign(Math.sin(w * t)),
      fallen: false,
    });
  }
  return out;
}

describe('auto slow-motion', () => {
  it('never triggers on normal walking sway', () => {
    const s = createSlowMoState();
    for (const sig of walkSignals(20)) expect(updateSlowMo(s, sig, 1 / 60)).toBe(1);
    expect(s.phase).toBe('idle');
  });

  it('detects the start of a fall from tilt and tilt rate', () => {
    expect(isFallStarting({ tilt: deg(10), tiltRate: 3, fallen: false })).toBe(false);
    expect(isFallStarting({ tilt: deg(25), tiltRate: 0.2, fallen: false })).toBe(false);
    expect(isFallStarting({ tilt: deg(25), tiltRate: 1.5, fallen: false })).toBe(true);
    expect(isFallStarting({ tilt: deg(45), tiltRate: 0, fallen: false })).toBe(true);
    expect(isFallStarting({ tilt: 0, tiltRate: 0, fallen: true })).toBe(true);
    expect(isFallStarting({ tilt: Number.NaN, tiltRate: 9, fallen: false })).toBe(false);
  });

  it('eases into slow motion, holds, then returns to 1 — once per run', () => {
    const s = createSlowMoState();
    // 倒れ始め:傾きが加速度的に増える
    let tilt = 0;
    let rate = 0;
    let triggeredAt = -1;
    const scales: number[] = [];
    for (let i = 0; i < 60 * 6; i++) {
      const scale = updateSlowMo(s, { tilt, tiltRate: rate, fallen: false }, 1 / 60);
      scales.push(scale);
      if (triggeredAt < 0 && s.phase !== 'idle') triggeredAt = i;
      // シミュレーション時間は scale 倍でしか進まない
      const simDt = scale / 60;
      rate = Math.min(rate + 6 * simDt, 4);
      tilt = Math.min(tilt + rate * simDt, Math.PI / 2);
    }
    expect(triggeredAt).toBeGreaterThan(0);
    const min = Math.min(...scales);
    expect(min).toBeCloseTo(P.slowScale, 6);
    // 減速は 0.15 秒程度で終わる
    const reachedSlow = scales.findIndex((v) => Math.abs(v - P.slowScale) < 1e-9);
    expect(reachedSlow - triggeredAt).toBeLessThanOrEqual(Math.ceil(P.easeIn * 60) + 1);
    // 最後は 1 に戻って、傾いたままでも二度と発動しない
    expect(scales[scales.length - 1]).toBe(1);
    expect(s.phase).toBe('done');
    expect(isSlowMoActive(s)).toBe(false);
    for (let i = 0; i < 120; i++) {
      expect(updateSlowMo(s, { tilt: deg(80), tiltRate: 5, fallen: true }, 1 / 60)).toBe(1);
    }
    // リセットで再び発動できる
    resetSlowMo(s);
    updateSlowMo(s, { tilt: deg(80), tiltRate: 5, fallen: true }, 1 / 60);
    expect(isSlowMoActive(s)).toBe(true);
  });

  it('the timeline depends only on accumulated real time', () => {
    const fall: FallSignal = { tilt: deg(50), tiltRate: 2, fallen: false };
    const a = createSlowMoState();
    const b = createSlowMoState();
    for (let i = 0; i < 90; i++) updateSlowMo(a, fall, 1 / 60);
    for (let i = 0; i < 45; i++) updateSlowMo(b, fall, 1 / 30);
    expect(b.phase).toBe(a.phase);
    expect(b.scale).toBeCloseTo(a.scale, 9);
    // 1 回の長いフレームで全段階をまたいでも最後は 1
    const c = createSlowMoState();
    expect(updateSlowMo(c, fall, 100)).toBe(1);
    expect(c.phase).toBe('done');
  });

  it('scale stays within [slowScale, 1]', () => {
    const s = createSlowMoState();
    for (let i = 0; i < 400; i++) {
      const v = updateSlowMo(s, { tilt: deg(60), tiltRate: 3, fallen: false }, 1 / 60);
      expect(v).toBeGreaterThanOrEqual(P.slowScale - 1e-12);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
