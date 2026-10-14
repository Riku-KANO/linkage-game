import { describe, expect, it } from 'vitest';
import { jansenWalker } from '@/core/model/presets';
import { GHOST_STRIDE, ghostFrameCount } from '@/core/model/ghost';
import { createKinematicPreviewSim } from './previewSim';
import { createTestRunController } from './controller';

const DT = 1 / 240;

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const make = (opts: Partial<Parameters<typeof createTestRunController>[0]> = {}) =>
  createTestRunController({ sim: createKinematicPreviewSim(jansenWalker()), ...opts });

describe('createTestRunController', () => {
  it('advances the sim at 240 Hz from frame time', () => {
    const c = make();
    for (let i = 0; i < 60; i++) c.tick(1 / 60);
    expect(c.clock.steps).toBe(240);
    expect(c.getLatest().time).toBeCloseTo(1, 9);
    expect(c.getSnapshot().time).toBeCloseTo(1, 9);
  });

  it('runs identically under different frame-time jitter (determinism end to end)', () => {
    const a = make({ autoSlowMo: false });
    const b = make({ autoSlowMo: false });
    for (let i = 0; i < 300; i++) a.tick(1 / 60);
    const rnd = lcg(3);
    let left = 5;
    while (left > 0.03) {
      const f = 0.004 + 0.026 * rnd();
      b.tick(f);
      left -= f;
    }
    b.tick(left);
    expect(b.clock.steps).toBe(a.clock.steps);
    const sa = a.getLatest();
    const sb = b.getLatest();
    expect(sb.time).toBe(sa.time);
    expect(sb.body.position.x).toBe(sa.body.position.x);
    expect(sb.motorAngle).toBe(sa.motorAngle);
    expect(Array.from(sb.legPositions[3]!)).toEqual(Array.from(sa.legPositions[3]!));
  });

  it('interpolates between fixed steps in slow motion', () => {
    const c = make();
    c.setSpeed(0.25);
    for (let i = 0; i < 10; i++) c.tick(1 / 60);
    const times: number[] = [];
    for (let i = 0; i < 12; i++) {
      c.tick(1 / 240);
      times.push(c.getSnapshot().time);
    }
    // 1/240 × 0.25 ずつ滑らかに進む(ステップの境目で跳ばない)
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeCloseTo(DT / 4, 9);
    }
  });

  it('pause, single-step and speed controls update the store', () => {
    const c = make();
    c.togglePause();
    expect(c.store.getState().paused).toBe(true);
    c.tick(1);
    expect(c.clock.steps).toBe(0);
    c.stepOnce();
    expect(c.clock.steps).toBe(1);
    expect(c.getSnapshot().time).toBeCloseTo(DT, 12);
    c.setSpeed(4);
    expect(c.store.getState().speed).toBe(4);
    c.setPaused(false);
    c.tick(1 / 60);
    expect(c.clock.steps).toBe(1 + 16);
    expect(c.timeScale).toBe(4);
  });

  it('reports the goal once reached and keeps the first event', () => {
    const c = make({ goalX: 0.5 });
    expect(c.store.getState().status).toBe('running');
    for (let i = 0; i < 60 * 5; i++) c.tick(1 / 60);
    expect(c.store.getState().status).toBe('goal');
    c.reset();
    expect(c.store.getState().status).toBe('running');
    expect(c.getSnapshot().time).toBe(0);
  });

  it('slows time down automatically when the machine starts to fall', () => {
    const c = createTestRunController({
      sim: createKinematicPreviewSim(jansenWalker(), undefined, { tipOverAt: 1 }),
    });
    let sawSlow = false;
    let minScale = 1;
    for (let i = 0; i < 60 * 8; i++) {
      c.tick(1 / 60);
      if (c.store.getState().slowMo) sawSlow = true;
      minScale = Math.min(minScale, c.timeScale);
    }
    expect(sawSlow).toBe(true);
    expect(minScale).toBeLessThan(0.3);
    expect(c.store.getState().status).toBe('fallen');
    // 8 秒の実時間で、スローの分だけシミュレーションは遅れる
    expect(c.getLatest().time).toBeLessThan(7.5);
    // 戻った後は 1×
    expect(c.timeScale).toBe(1);
    expect(c.store.getState().slowMo).toBe(false);
  });

  it('records a ghost at 10 Hz and keeps the previous run after reset', () => {
    const c = make();
    for (let i = 0; i < 120; i++) c.tick(1 / 60);
    const g = c.currentGhost()!;
    expect(g.hz).toBe(10);
    expect(ghostFrameCount(g)).toBe(21);
    // フレーム 10 は時刻 1 の姿勢
    expect(g.frames[10 * GHOST_STRIDE + 7]).toBeCloseTo((-40 * 2 * Math.PI) / 60, 6);
    expect(c.previousGhost()).toBeNull();
    c.reset();
    expect(ghostFrameCount(c.previousGhost()!)).toBe(21);
    expect(ghostFrameCount(c.currentGhost()!)).toBe(1);
  });

  it('notifies frame listeners and lets them unsubscribe', () => {
    const c = make();
    let calls = 0;
    const off = c.onFrame((s) => {
      expect(s).toBe(c.getSnapshot());
      calls++;
    });
    c.tick(1 / 60);
    c.stepOnce();
    c.reset();
    expect(calls).toBe(3);
    off();
    c.tick(1 / 60);
    expect(calls).toBe(3);
  });

  it('toggles visualizations and the follow camera', () => {
    const c = make({ show: { trails: false } });
    expect(c.store.getState().show.trails).toBe(false);
    c.setShow({ trails: true, com: false });
    expect(c.store.getState().show).toMatchObject({ trails: true, com: false, contacts: true });
    c.setFollow(false);
    expect(c.store.getState().follow).toBe(false);
  });
});
