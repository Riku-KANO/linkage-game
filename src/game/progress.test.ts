import { describe, expect, it } from 'vitest';
import {
  availableFeatures,
  availableParts,
  improvedAxes,
  initialProgress,
  isChapterCleared,
  isChapterUnlocked,
  isStageCleared,
  isStageUnlocked,
  mergeBest,
  newlyUnlocked,
  progressReducer,
  recordResult,
  syncUnlocks,
} from './progress';
import { stagesOfChapter } from './stages';
import type { Progress, RunResult, StageId } from './types';

const win = (stageId: StageId, patch: Partial<RunResult> = {}): RunResult => ({
  stageId,
  cleared: true,
  reason: null,
  time: 10,
  parts: 10,
  cost: 600,
  energy: 100,
  distance: 3,
  medals: { time: 'silver', parts: 'gold', cost: 'silver', energy: 'bronze' },
  ...patch,
});

const lose = (stageId: StageId, patch: Partial<RunResult> = {}): RunResult => ({
  stageId,
  cleared: false,
  reason: 'fallen',
  time: 30,
  parts: 10,
  cost: 600,
  energy: 40,
  distance: 1,
  medals: { time: null, parts: null, cost: null, energy: null },
  ...patch,
});

const clearChapter = (p: Progress, chapter: number) =>
  stagesOfChapter(chapter).reduce((acc, s) => recordResult(acc, win(s.id)), p);

describe('progress (GAME-3)', () => {
  it('starts with chapter 1 and its first stage', () => {
    const p = initialProgress();
    expect(p).toEqual({
      version: 1,
      best: {},
      unlockedChapters: [1],
      zukan: [],
      seenTransitions: [],
    });
    expect(isStageUnlocked(p, 'c1-s1')).toBe(true);
    expect(isStageUnlocked(p, 'c1-s2')).toBe(false);
    expect(isStageUnlocked(p, 'c2-s1')).toBe(false);
    expect(isStageUnlocked(p, 'nope')).toBe(false);
    expect(availableParts(p)).toEqual(['link', 'pin', 'fixed', 'crank']);
    expect(availableFeatures(p)).toEqual([]);
  });

  it('unlocks the next stage when a stage is cleared, not when it fails', () => {
    const p0 = initialProgress();
    const failed = recordResult(p0, lose('c1-s1'));
    expect(isStageCleared(failed, 'c1-s1')).toBe(false);
    expect(isStageUnlocked(failed, 'c1-s2')).toBe(false);
    expect(failed.best['c1-s1']?.reason).toBe('fallen');
    const p1 = recordResult(failed, win('c1-s1'));
    expect(isStageCleared(p1, 'c1-s1')).toBe(true);
    expect(isStageUnlocked(p1, 'c1-s2')).toBe(true);
    expect(isStageUnlocked(p1, 'c1-s3')).toBe(false);
    // 元の進行は変えない
    expect(p0.best).toEqual({});
  });

  it('unlocks chapter 2 and the leg array after clearing chapter 1', () => {
    const p = clearChapter(initialProgress(), 1);
    expect(isChapterCleared(p, 1)).toBe(true);
    expect(isChapterUnlocked(p, 2)).toBe(true);
    expect(p.unlockedChapters).toEqual([1, 2]);
    expect(isStageUnlocked(p, 'c2-s1')).toBe(true);
    expect(isStageUnlocked(p, 'c2-s2')).toBe(false);
    expect(availableParts(p)).toEqual(['link', 'pin', 'fixed', 'crank']);
    expect(availableFeatures(p)).toEqual(['legArray']);
  });

  it('unlocks the (not yet playable) chapter 3 after chapter 2, but nothing beyond', () => {
    const p = clearChapter(clearChapter(initialProgress(), 1), 2);
    expect(p.unlockedChapters).toEqual([1, 2, 3]);
    expect(availableFeatures(p)).toEqual(['legArray', 'bodyPreset']);
    expect(availableParts(p)).not.toContain('gear');
    expect(isChapterCleared(p, 3)).toBe(false);
  });

  it('lists later parts once their chapters are unlocked', () => {
    const p: Progress = { ...initialProgress(), unlockedChapters: [1, 2, 3, 4, 5] };
    expect(availableParts(p)).toEqual([
      'link',
      'pin',
      'fixed',
      'crank',
      'gear',
      'slider',
      'spring',
    ]);
  });

  it('keeps the best value per axis across cleared runs', () => {
    const a = win('c1-s1', {
      time: 9,
      parts: 12,
      cost: 500,
      energy: 120,
      distance: 1.6,
      medals: { time: 'silver', parts: 'silver', cost: 'gold', energy: 'bronze' },
    });
    const b = win('c1-s1', {
      time: 7,
      parts: 10,
      cost: 640,
      energy: 150,
      distance: 1.5,
      medals: { time: 'gold', parts: 'gold', cost: 'silver', energy: null },
    });
    const m = mergeBest(a, b);
    expect(m).toEqual({
      stageId: 'c1-s1',
      cleared: true,
      reason: null,
      time: 7,
      parts: 10,
      cost: 500,
      energy: 120,
      distance: 1.6,
      medals: { time: 'gold', parts: 'gold', cost: 'gold', energy: 'bronze' },
    });
  });

  it('never replaces a cleared record with a failure; keeps the farthest failure', () => {
    const cleared = win('c1-s1');
    expect(mergeBest(cleared, lose('c1-s1', { distance: 9 }))).toBe(cleared);
    const near = lose('c1-s1', { distance: 0.5 });
    const far = lose('c1-s1', { distance: 1.2 });
    expect(mergeBest(near, far)).toBe(far);
    expect(mergeBest(far, near)).toBe(far);
    expect(mergeBest(undefined, near)).toBe(near);
    expect(mergeBest(far, cleared)).toBe(cleared);
  });

  it('reports which axes improved', () => {
    const prev = win('c1-s1', { time: 9, parts: 10, cost: 500, energy: 120 });
    const next = win('c1-s1', { time: 8, parts: 10, cost: 520, energy: 100 });
    expect(improvedAxes(prev, next)).toEqual(['time', 'energy']);
    expect(improvedAxes(undefined, next)).toEqual(['time', 'parts', 'cost', 'energy']);
    expect(improvedAxes(lose('c1-s1'), next)).toEqual(['time', 'parts', 'cost', 'energy']);
    expect(improvedAxes(prev, lose('c1-s1'))).toEqual([]);
  });

  it('reports what a result newly unlocked', () => {
    const p0 = initialProgress();
    const p1 = recordResult(p0, win('c1-s1'));
    expect(newlyUnlocked(p0, p1)).toEqual({
      stages: ['c1-s2'],
      chapters: [],
      parts: [],
      features: [],
    });
    const almost = stagesOfChapter(1)
      .slice(0, 4)
      .reduce((acc, s) => recordResult(acc, win(s.id)), p0);
    const done = recordResult(almost, win('c1-s5'));
    expect(newlyUnlocked(almost, done)).toEqual({
      stages: ['c2-s1'],
      chapters: [2],
      parts: [],
      features: ['legArray'],
    });
  });

  it('repairs unlocks of loaded progress', () => {
    const broken: Progress = {
      ...clearChapter(initialProgress(), 1),
      unlockedChapters: [],
    };
    expect(syncUnlocks(broken).unlockedChapters).toEqual([1, 2]);
    const p = initialProgress();
    expect(syncUnlocks(p)).toBe(p);
  });
});

describe('progressReducer', () => {
  it('records results, ignoring unknown stages', () => {
    const p0 = initialProgress();
    const p1 = progressReducer(p0, { type: 'record', result: win('c1-s1') });
    expect(isStageUnlocked(p1, 'c1-s2')).toBe(true);
    expect(progressReducer(p1, { type: 'record', result: win('sandbox') })).toBe(p1);
  });

  it('remembers transitions and zukan entries once', () => {
    let p = initialProgress();
    p = progressReducer(p, { type: 'seeTransition', id: 'T-01' });
    p = progressReducer(p, { type: 'seeTransition', id: 'T-01' });
    p = progressReducer(p, { type: 'registerZukan', id: 'jansen' });
    p = progressReducer(p, { type: 'registerZukan', id: 'jansen' });
    expect(p.seenTransitions).toEqual(['T-01']);
    expect(p.zukan).toEqual(['jansen']);
    expect(progressReducer(p, { type: 'reset' })).toEqual(initialProgress());
  });
});
