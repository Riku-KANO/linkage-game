import { describe, expect, it } from 'vitest';
import { computeBill } from '@/core/model/parts';
import { jansenMachine } from './designs';
import { betterMedal, evaluateRun, medalFor, medalRank } from './evaluate';
import { getStage } from './stages';
import type { RunSummary, StageDef } from './types';

const stage = getStage('c1-s4')!;
const design = stage.reference!;

const run = (patch: Partial<RunSummary> = {}): RunSummary => ({
  time: 7.5,
  distance: 3.05,
  reachedGoal: true,
  fallen: false,
  stalled: false,
  jammed: false,
  energy: 100,
  ...patch,
});

describe('medals', () => {
  it('awards gold/silver/bronze by thresholds (lower is better, inclusive)', () => {
    const th: [number, number, number] = [10, 20, 30];
    expect(medalFor(5, th)).toBe('gold');
    expect(medalFor(10, th)).toBe('gold');
    expect(medalFor(10.01, th)).toBe('silver');
    expect(medalFor(20, th)).toBe('silver');
    expect(medalFor(30, th)).toBe('bronze');
    expect(medalFor(30.5, th)).toBeNull();
    expect(medalFor(Number.NaN, th)).toBeNull();
    expect(medalFor(Infinity, th)).toBeNull();
  });

  it('ranks medals', () => {
    expect(medalRank('gold')).toBeGreaterThan(medalRank('silver'));
    expect(medalRank('silver')).toBeGreaterThan(medalRank('bronze'));
    expect(medalRank('bronze')).toBeGreaterThan(medalRank(null));
    expect(betterMedal('silver', 'gold')).toBe('gold');
    expect(betterMedal(null, 'bronze')).toBe('bronze');
    expect(betterMedal(null, null)).toBeNull();
  });
});

describe('evaluateRun (GAME-2)', () => {
  it('clears when the goal is reached in time without falling, with per-axis medals', () => {
    const r = evaluateRun(stage, design, run());
    const bill = computeBill(design);
    expect(r).toMatchObject({
      stageId: 'c1-s4',
      cleared: true,
      reason: null,
      time: 7.5,
      parts: bill.parts,
      cost: bill.cost,
      energy: 100,
      distance: 3.05,
    });
    expect(r.medals).toEqual({
      time: medalFor(7.5, stage.medals.time),
      parts: medalFor(bill.parts, stage.medals.parts),
      cost: medalFor(bill.cost, stage.medals.cost),
      energy: medalFor(100, stage.medals.energy),
    });
    expect(r.medals.time).toBe('gold');
    expect(r.medals.parts).toBe('gold');
  });

  it('fails with timeout when the goal is not reached, and uses the time limit', () => {
    const r = evaluateRun(stage, design, run({ reachedGoal: false, time: 30, distance: 1.2 }));
    expect(r.cleared).toBe(false);
    expect(r.reason).toBe('timeout');
    expect(r.time).toBe(stage.timeLimit);
    expect(r.distance).toBe(1.2);
    expect(r.medals).toEqual({ time: null, parts: null, cost: null, energy: null });
  });

  it('fails with timeout when the goal is reached after the time limit', () => {
    const r = evaluateRun(stage, design, run({ time: stage.timeLimit + 0.5 }));
    expect(r.cleared).toBe(false);
    expect(r.reason).toBe('timeout');
  });

  it('fails when the machine fell, even at the goal', () => {
    const r = evaluateRun(stage, design, run({ fallen: true }));
    expect(r.cleared).toBe(false);
    expect(r.reason).toBe('fallen');
  });

  it('reports stalls and jams (jam first)', () => {
    const notThere = { reachedGoal: false, time: 30, distance: 0.4 };
    expect(evaluateRun(stage, design, run({ ...notThere, stalled: true })).reason).toBe('stalled');
    expect(
      evaluateRun(stage, design, run({ ...notThere, stalled: true, jammed: true })).reason,
    ).toBe('jammed');
    expect(
      evaluateRun(stage, design, run({ ...notThere, fallen: true, stalled: true })).reason,
    ).toBe('fallen');
  });

  it('fails over budget even when the goal is reached', () => {
    const s = getStage('c2-s5')!;
    const r = evaluateRun(s, jansenMachine(), run({ time: 10 }));
    expect(r.cleared).toBe(false);
    expect(r.reason).toBe('overBudget');
    expect(r.cost).toBeGreaterThan(s.budget!);
  });

  it('does not award a medal on an axis beyond bronze', () => {
    const s: StageDef = { ...stage, medals: { ...stage.medals, energy: [1, 2, 3] } };
    expect(evaluateRun(s, design, run()).medals.energy).toBeNull();
  });
});
