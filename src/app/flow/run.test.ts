import { beforeAll, describe, expect, it } from 'vitest';
import { createFlatTerrain, createRapierTerrain, runHeadless } from '@/core/sim';
import type { TerrainCollider } from '@/core/sim';
import { jammingFourBar, jansenOneSided, jansenTwoSided } from '@/core/sim/fixtures';
import { GHOST_STRIDE, ghostFrameCount } from '@/core/model/ghost';
import {
  getStage,
  initialProgress,
  isStageUnlocked,
  nextStageId,
  startDesign,
  type StageDef,
} from '@/game';
import { completeRun, LiveRun, runStageHeadless, STALL_TIMEOUT } from './run';

const c1s1 = getStage('c1-s1')!;
const flat = createFlatTerrain(0);
/** 平地の試し用ステージ(ゴールは遠く、制限時間は短め) */
const testStage = (over: Partial<StageDef> = {}): StageDef => ({
  ...c1s1,
  id: 'test',
  goal: { x: 50 },
  timeLimit: 6,
  ...over,
});

let rapier: TerrainCollider;
beforeAll(async () => {
  rapier = await createRapierTerrain(c1s1.terrain);
});

describe('LiveRun (FLOW-2)', () => {
  it('the chapter-1 reference clears the first stage and unlocks the next one', () => {
    const design = c1s1.reference!;
    const { summary, ghost, end } = runStageHeadless(c1s1, design, rapier);
    expect(end).toBe('goal');
    expect(summary.reachedGoal).toBe(true);
    expect(summary.time).toBeLessThanOrEqual(c1s1.timeLimit);
    expect(summary.distance).toBeGreaterThan(c1s1.goal.x - c1s1.start.x - 0.2);
    expect(summary.comHeight).toBeGreaterThan(0.05);
    expect(ghostFrameCount(ghost)).toBe(Math.floor(summary.time * 10 + 1e-6) + 1);

    const { outcome, progress } = completeRun({
      stage: c1s1,
      slot: c1s1.id,
      design,
      summary,
      ghost,
      progress: initialProgress(),
    });
    expect(outcome.result.cleared).toBe(true);
    expect(outcome.diagnosis).toBeNull();
    expect(outcome.improved).toEqual(['time', 'parts', 'cost', 'energy']);
    const next = nextStageId(c1s1.id)!;
    expect(outcome.nextStageId).toBe(next);
    expect(outcome.unlocks.stages).toEqual([next]);
    expect(isStageUnlocked(progress, next)).toBe(true);
    expect(progress.best[c1s1.id]?.cleared).toBe(true);
  });

  it('live runs with irregular frames, speed changes and pauses match the headless run bit for bit', () => {
    const design = c1s1.reference!;
    const headless = runStageHeadless(c1s1, design, rapier);

    const live = new LiveRun(c1s1, design, rapier);
    const frames = [1 / 60, 1 / 144, 0.033, 0.25, 1 / 60, 0.0007, 1 / 30];
    let i = 0;
    while (!live.done && i < 100000) {
      if (i % 50 === 10) live.paused = true;
      if (i % 50 === 13) live.paused = false;
      live.speed = i % 7 === 0 ? 2 : i % 5 === 0 ? 0.5 : 1;
      live.advance(frames[i % frames.length]!);
      i++;
    }
    expect(live.done).toBe(true);
    expect(live.end).toBe(headless.end);
    expect(live.summary()).toEqual(headless.summary);
    expect(live.ghost()).toEqual(headless.ghost);
  });

  it('agrees with the simulator’s own headless runner', () => {
    const design = c1s1.reference!;
    const ours = runStageHeadless(c1s1, design, rapier);
    const sim = runHeadless(
      { design, terrain: rapier, start: c1s1.start },
      { maxTime: c1s1.timeLimit, goalX: c1s1.goal.x, stallTimeout: STALL_TIMEOUT },
    );
    expect(ours.summary.time).toBe(sim.time);
    expect(ours.summary.distance).toBe(sim.distance);
    expect(ours.summary.energy).toBe(sim.energy);
    expect(ours.summary.reachedGoal).toBe(sim.reachedGoal);
    expect(ours.summary.maxTilt).toBe(sim.maxTilt);
    // ゴーストは sim の 10Hz の姿勢列と同じ姿勢
    const n = ghostFrameCount(ours.ghost);
    for (let k = 0; k < n; k++) {
      const p = sim.trace[k]!;
      const f = ours.ghost.frames.slice(k * GHOST_STRIDE, (k + 1) * GHOST_STRIDE);
      expect(f).toEqual([
        p.position.x,
        p.position.y,
        p.position.z,
        p.quaternion.x,
        p.quaternion.y,
        p.quaternion.z,
        p.quaternion.w,
        p.motorAngle,
      ]);
    }
  });

  it('advance steps the fixed 240 Hz clock: one 60 Hz frame is exactly 4 steps', () => {
    const live = new LiveRun(testStage(), jansenTwoSided(), flat);
    for (let k = 0; k < 30; k++) expect(live.advance(1 / 60)).toBe(4);
    live.speed = 2;
    expect(live.advance(1 / 60)).toBe(8);
    live.paused = true;
    expect(live.advance(1 / 60)).toBe(0);
    live.paused = false;
    // 大きく飛んだフレームは MAX_FRAME_DT(0.1s)までしか進めない
    live.speed = 1;
    expect(live.advance(5)).toBe(24);
    expect(live.time).toBeCloseTo((120 + 8 + 24) / 240, 9);
  });

  it('ends when the motor has stalled for STALL_TIMEOUT seconds', () => {
    const stage = testStage({ timeLimit: 20 });
    const run = runStageHeadless(stage, jansenTwoSided(), flat, {
      params: { motor: { stallTorque: 3 } },
    });
    expect(run.end).toBe('stalled');
    expect(run.summary.stalled).toBe(true);
    expect(run.summary.time).toBeGreaterThanOrEqual(STALL_TIMEOUT);
    expect(run.summary.time).toBeLessThan(5);
    const { outcome } = completeRun({
      stage,
      slot: stage.id,
      design: jansenTwoSided(),
      summary: run.summary,
      ghost: run.ghost,
      progress: initialProgress(),
    });
    expect(outcome.result.cleared).toBe(false);
    expect(outcome.result.reason).toBe('stalled');
    expect(outcome.diagnosis?.cause).toBe('stalled');
  });

  it('ends at the time limit', () => {
    const run = runStageHeadless(testStage({ timeLimit: 0.5 }), jansenTwoSided(), flat);
    expect(run.end).toBe('timeLimit');
    expect(run.summary.time).toBeCloseTo(0.5, 9);
    expect(run.summary.reachedGoal).toBe(false);
  });

  it('ends on a jammed mechanism', () => {
    const run = runStageHeadless(testStage({ timeLimit: 20 }), jammingFourBar(), flat);
    expect(run.end).toBe('jammed');
    expect(run.summary.jammed).toBe(true);
  });

  it('ends when the machine falls over', () => {
    const run = runStageHeadless(testStage({ timeLimit: 20 }), jansenOneSided(), flat);
    expect(run.end).toBe('fallen');
    expect(run.summary.fallen).toBe(true);
    expect(run.summary.maxTilt).toBeGreaterThan(1);
  });

  it('status reports progress towards the goal', () => {
    const live = new LiveRun(testStage({ goal: { x: 5 } }), jansenTwoSided(), flat);
    expect(live.status().progress).toBe(0);
    for (let k = 0; k < 60 && !live.done; k++) live.advance(1 / 60);
    const s = live.status();
    expect(s.distance).toBeGreaterThan(0.2);
    expect(s.progress).toBeCloseTo(s.distance / s.goalDistance, 9);
    expect(live.snapshot()).toBe(live.snapshot());
  });

  it('records a failing start design without unlocking anything', () => {
    // 章 1 の最初の設計(リンクが 1 本外れて自由度 2)は試走前チェックで止まる。ここでは
    // 評価だけ:未クリアの結果は記録され、次のステージは開かない
    const design = startDesign(c1s1);
    const { outcome, progress } = completeRun({
      stage: c1s1,
      slot: c1s1.id,
      design,
      summary: {
        time: 1,
        distance: 0,
        reachedGoal: false,
        fallen: false,
        stalled: false,
        jammed: true,
        energy: 0,
      },
      ghost: { hz: 10, frames: [] },
      progress: initialProgress(),
      preflight: { ok: false, problems: [] },
    });
    expect(outcome.result.cleared).toBe(false);
    expect(outcome.diagnosis?.cause).toBe('invalid');
    expect(outcome.nextStageId).toBeNull();
    expect(outcome.unlocks.stages).toEqual([]);
    expect(isStageUnlocked(progress, nextStageId(c1s1.id)!)).toBe(false);
  });
});
