import { describe, expect, it } from 'vitest';
import { createSimClock, SIM_SPEEDS } from './clock';

const DT = 1 / 240;

/** シード付きの擬似乱数(Math.random は使わない) */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** 合計 total 秒をばらつきのあるフレームに分ける(最後のフレームで端数を合わせる) */
function jitteredFrames(total: number, seed: number, min = 0.004, max = 0.034): number[] {
  const rnd = lcg(seed);
  const out: number[] = [];
  let left = total;
  while (left > max) {
    const f = min + (max - min) * rnd();
    out.push(f);
    left -= f;
  }
  out.push(left);
  return out;
}

function run(frames: number[], speed = 1): { calls: number; steps: number } {
  const clock = createSimClock({ dt: DT, maxSubsteps: 1000 });
  clock.setSpeed(speed);
  let calls = 0;
  for (const f of frames) clock.advance(f, () => calls++);
  return { calls, steps: clock.steps };
}

describe('createSimClock', () => {
  it('steps at a fixed 240 Hz from real frame time', () => {
    const clock = createSimClock({ dt: DT });
    let calls = 0;
    const n = clock.advance(1 / 60, () => calls++);
    expect(n).toBe(4);
    expect(calls).toBe(4);
    expect(clock.steps).toBe(4);
    expect(clock.simTime).toBeCloseTo(4 * DT, 12);
  });

  it('the number of step() calls depends only on accumulated time, not on frame jitter', () => {
    for (const total of [1, 2.5, 10, 33.3]) {
      const expected = Math.floor(total / DT + 1e-6);
      const even = run(
        Array.from({ length: Math.round(total * 60) }, () => total / Math.round(total * 60)),
      );
      expect(even.calls).toBe(expected);
      for (const seed of [1, 2, 3, 42, 1234]) {
        const jit = run(jitteredFrames(total, seed));
        expect(jit.calls).toBe(expected);
        expect(jit.steps).toBe(expected);
      }
    }
  });

  it('is deterministic for every speed multiplier', () => {
    for (const speed of SIM_SPEEDS) {
      const total = 6;
      const expected = Math.floor((total * speed) / DT + 1e-6);
      const a = run(jitteredFrames(total, 7), speed);
      const b = run(jitteredFrames(total, 99, 0.001, 0.05), speed);
      const c = run(
        Array.from({ length: 360 }, () => total / 360),
        speed,
      );
      expect(a.calls).toBe(expected);
      expect(b.calls).toBe(expected);
      expect(c.calls).toBe(expected);
    }
  });

  it('the step count at any prefix matches floor(time / dt) (no drift over long runs)', () => {
    const clock = createSimClock({ dt: DT, maxSubsteps: 1000 });
    const frames = jitteredFrames(120, 5);
    let t = 0;
    for (const f of frames) {
      clock.advance(f, () => {});
      t += f;
      const expected = Math.floor(t / DT + 1e-6);
      expect(Math.abs(clock.steps - expected)).toBeLessThanOrEqual(0);
    }
  });

  it('pause stops stepping and does not bank time', () => {
    const clock = createSimClock({ dt: DT });
    clock.setPaused(true);
    let calls = 0;
    expect(clock.advance(1, () => calls++)).toBe(0);
    clock.setPaused(false);
    clock.advance(1 / 60, () => calls++);
    expect(calls).toBe(4);
    clock.togglePause();
    expect(clock.paused).toBe(true);
  });

  it('single-step advances exactly one step and resets the sub-step remainder', () => {
    const clock = createSimClock({ dt: DT });
    clock.advance(DT * 2.5, () => {});
    expect(clock.steps).toBe(2);
    expect(clock.alpha).toBeCloseTo(0.5, 9);
    clock.setPaused(true);
    let calls = 0;
    clock.stepOnce(() => calls++);
    expect(calls).toBe(1);
    expect(clock.steps).toBe(3);
    expect(clock.alpha).toBe(0);
  });

  it('clamps sub-steps per frame so a long frame cannot cause a spiral of death', () => {
    const clock = createSimClock({ dt: DT, maxSubsteps: 16, maxFrameDt: 10 });
    let calls = 0;
    const n = clock.advance(1, () => calls++);
    expect(n).toBe(16);
    expect(calls).toBe(16);
    expect(clock.dropped).toBeGreaterThan(0);
    // 切り捨てた時間を次のフレームに持ち越さない
    const m = clock.advance(1 / 60, () => calls++);
    expect(m).toBe(4);
    expect(clock.dropped).toBe(0);
  });

  it('clamps very long frames (tab switch) to maxFrameDt', () => {
    const clock = createSimClock({ dt: DT, maxSubsteps: 1000, maxFrameDt: 0.1 });
    expect(clock.advance(5, () => {})).toBe(24);
  });

  it('applies an extra time scale (auto slow-motion)', () => {
    const clock = createSimClock({ dt: DT });
    let calls = 0;
    for (let i = 0; i < 60; i++) clock.advance(1 / 60, () => calls++, 0.25);
    expect(calls).toBe(60);
  });

  it('reports the interpolation fraction alpha in [0, 1)', () => {
    const clock = createSimClock({ dt: DT });
    clock.setSpeed(0.25);
    clock.advance(1 / 120, () => {});
    // 1/120 × 0.25 = 1/480 = 半ステップ
    expect(clock.steps).toBe(0);
    expect(clock.alpha).toBeCloseTo(0.5, 9);
  });

  it('rejects unsupported speeds and ignores bad frame times', () => {
    const clock = createSimClock({ dt: DT });
    clock.setSpeed(3);
    expect(clock.speed).toBe(1);
    expect(clock.advance(Number.NaN, () => {})).toBe(0);
    expect(clock.advance(-1, () => {})).toBe(0);
  });

  it('reset returns to time zero', () => {
    const clock = createSimClock({ dt: DT });
    clock.advance(0.5, () => {});
    clock.setSpeed(2);
    clock.reset();
    expect(clock.steps).toBe(0);
    expect(clock.simTime).toBe(0);
    expect(clock.alpha).toBe(0);
    // 速度と一時停止は利用者の設定なので保つ
    expect(clock.speed).toBe(2);
  });
});
