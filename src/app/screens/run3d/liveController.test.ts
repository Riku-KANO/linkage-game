import { describe, expect, it, vi } from 'vitest';
import { LiveRun, runStageHeadless } from '@/app/flow';
import { createFlatTerrain } from '@/core/sim';
import { jansenOneSided } from '@/core/sim/fixtures';
import { getStage, type StageDef } from '@/game';
import { createLiveRunController, statusOfEnd } from './liveController';

const c1s1 = getStage('c1-s1')!;
const flat = createFlatTerrain(0);
const design = c1s1.reference!;

describe('createLiveRunController (INT-2: one clock over LiveRun)', () => {
  it('irregular frames, speeds, pauses, single steps and slow-mo end exactly like the headless run', () => {
    const headless = runStageHeadless(c1s1, design, flat);
    const live = new LiveRun(c1s1, design, flat);
    const c = createLiveRunController(live);
    const frames = [1 / 60, 1 / 144, 0.033, 0.25, 1 / 60, 0.0007, 1 / 30];
    const speeds = [1, 2, 0.25, 4] as const;
    let i = 0;
    while (!live.done && i < 100000) {
      if (i % 40 === 5) c.setPaused(true);
      if (i % 40 === 8) c.setPaused(false);
      if (i % 40 === 20) c.stepOnce();
      if (i % 40 === 21) c.setPaused(false);
      if (i % 13 === 0) c.setSpeed(speeds[(i / 13) % speeds.length]!);
      c.setTimeScale(i % 17 === 0 ? 0.3 : 1);
      c.tick(frames[i % frames.length]!);
      i++;
    }
    expect(live.done).toBe(true);
    expect(live.end).toBe(headless.end);
    expect(live.summary()).toEqual(headless.summary);
    expect(live.ghost()).toEqual(headless.ghost);
    // 終わったら最後の姿勢(補間しない)
    c.tick(1 / 60);
    expect(c.getSnapshot().time).toBe(live.time);
    expect(c.store.getState().status).toBe('goal');
  });

  it('interpolates the rendered snapshot between fixed steps', () => {
    const live = new LiveRun(c1s1, design, flat);
    const c = createLiveRunController(live, { autoSlowMo: false });
    const dt = live.dt;
    c.tick(dt * 1.5);
    c.tick(dt);
    expect(live.time).toBeCloseTo(dt * 2, 12);
    const t = c.getSnapshot().time;
    expect(t).toBeCloseTo(dt * 1.5, 9);
    expect(c.getLatest().time).toBe(live.time);
  });

  it('pausing stops the run, mirrors LiveRun.paused, and the ui store follows', () => {
    const live = new LiveRun(c1s1, design, flat);
    const c = createLiveRunController(live);
    c.togglePause();
    expect(live.paused).toBe(true);
    expect(c.store.getState().paused).toBe(true);
    expect(c.timeScale).toBe(0);
    c.tick(0.5);
    expect(live.time).toBe(0);
    c.stepOnce();
    expect(live.time).toBeCloseTo(live.dt, 12);
    expect(c.getSnapshot().time).toBe(live.time);
  });

  it('runs the base speed of the LiveRun (×0.5 replay) times the chosen speed', () => {
    const live = new LiveRun(c1s1, design, flat);
    live.speed = 0.5;
    const c = createLiveRunController(live, { autoSlowMo: false });
    for (let k = 0; k < 60; k++) c.tick(1 / 60);
    expect(live.time).toBeCloseTo(0.5, 6);
    c.setSpeed(2);
    for (let k = 0; k < 60; k++) c.tick(1 / 60);
    expect(live.time).toBeCloseTo(1.5, 6);
    expect(c.timeScale).toBeCloseTo(1, 12);
  });

  it('setTimeScale(0) holds the run (for effects); 1 resumes', () => {
    const live = new LiveRun(c1s1, design, flat);
    const c = createLiveRunController(live, { autoSlowMo: false });
    c.setTimeScale(0);
    for (let k = 0; k < 10; k++) c.tick(1 / 60);
    expect(live.time).toBe(0);
    c.setTimeScale(1);
    c.tick(1 / 60);
    expect(live.time).toBeGreaterThan(0);
  });

  it('reset asks for a new run instead of rewinding the LiveRun', () => {
    const live = new LiveRun(c1s1, design, flat);
    const onRestart = vi.fn();
    const c = createLiveRunController(live, { onRestart });
    c.tick(0.2);
    const t = live.time;
    c.reset();
    c.sim.reset();
    expect(onRestart).toHaveBeenCalledTimes(2);
    expect(live.time).toBe(t);
  });

  it('sync() catches up after the LiveRun was finished from outside (結果へ)', () => {
    const live = new LiveRun(c1s1, design, flat);
    const c = createLiveRunController(live);
    const frames: number[] = [];
    c.onFrame((s) => frames.push(s.time));
    c.tick(0.1);
    live.runToEnd();
    c.sync();
    expect(c.getSnapshot().time).toBe(live.time);
    expect(frames.at(-1)).toBe(live.time);
    expect(c.store.getState().status).toBe('goal');
  });

  it('a one-sided machine falls: status fallen and the automatic slow motion kicks in', () => {
    const stage: StageDef = { ...c1s1, id: 'test', goal: { x: 50 }, timeLimit: 6 };
    const live = new LiveRun(stage, jansenOneSided(), flat);
    const c = createLiveRunController(live);
    let sawSlow = false;
    for (let k = 0; k < 2000 && !live.done; k++) {
      c.tick(1 / 60);
      if (c.store.getState().slowMo) sawSlow = true;
    }
    expect(live.end).toBe('fallen');
    expect(c.store.getState().status).toBe('fallen');
    expect(sawSlow).toBe(true);
  });

  it('maps run ends to the control bar status (time limit has no badge; stall is transient)', () => {
    expect(statusOfEnd('goal', false)).toBe('goal');
    expect(statusOfEnd('timeLimit', true)).toBe('running');
    expect(statusOfEnd(null, true)).toBe('stalled');
    expect(statusOfEnd(null, false)).toBe('running');
    expect(statusOfEnd('jammed', false)).toBe('jammed');
  });

  it('exposes what the testrun HUD needs (origin = start, goal, stall torque, ghosts)', () => {
    const live = new LiveRun(c1s1, design, flat);
    const prev = runStageHeadless(c1s1, design, flat).ghost;
    const c = createLiveRunController(live, { previousGhost: prev });
    expect(c.getOrigin().x).toBe(live.startX);
    expect(c.goalX).toBe(c1s1.goal.x);
    expect(c.sim.params.motor.stallTorque).toBeGreaterThan(0);
    expect(c.previousGhost()).toBe(prev);
    c.tick(0.3);
    expect(c.currentGhost()?.frames.length).toBeGreaterThan(0);
  });
});
