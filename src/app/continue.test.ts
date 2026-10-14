import { describe, expect, it } from 'vitest';
import { SANDBOX_SLOT } from '@/core/storage/persistence';
import { initialProgress, recordResult, STAGES, type Progress, type RunResult } from '@/game';
import { continueTarget, targetSlot } from './continue';

function cleared(p: Progress, stageId: string): Progress {
  const r: RunResult = {
    stageId,
    cleared: true,
    reason: null,
    time: 5,
    parts: 6,
    cost: 100,
    energy: 10,
    distance: 2,
    medals: { time: 'gold', parts: null, cost: null, energy: null },
  };
  return recordResult(p, r);
}

describe('continueTarget', () => {
  it('starts with the first stage on a fresh profile', () => {
    expect(continueTarget(initialProgress(), null)).toEqual({ kind: 'stage', stageId: 'c1-s1' });
  });

  it('prefers the last played stage, even if it is already cleared', () => {
    let p = cleared(initialProgress(), 'c1-s1');
    p = cleared(p, 'c1-s2');
    expect(continueTarget(p, 'c1-s1')).toEqual({ kind: 'stage', stageId: 'c1-s1' });
    expect(continueTarget(p, 'c1-s2')).toEqual({ kind: 'stage', stageId: 'c1-s2' });
  });

  it('reopens the sandbox when that was the last machine', () => {
    expect(continueTarget(initialProgress(), SANDBOX_SLOT)).toEqual({ kind: 'sandbox' });
  });

  it('falls back to the first unlocked uncleared stage when the last stage is locked or unknown', () => {
    const p = cleared(initialProgress(), 'c1-s1');
    // リセットで未解放に戻ったステージ
    expect(continueTarget(initialProgress(), 'c1-s4')).toEqual({ kind: 'stage', stageId: 'c1-s1' });
    expect(continueTarget(p, 'nope')).toEqual({ kind: 'stage', stageId: 'c1-s2' });
  });

  it('is null (disabled) when everything is cleared and nothing was played', () => {
    const all = STAGES.reduce((p, s) => cleared(p, s.id), initialProgress());
    expect(continueTarget(all, null)).toBeNull();
    expect(continueTarget(all, 'c2-s5')).toEqual({ kind: 'stage', stageId: 'c2-s5' });
  });

  it('maps a target back to its design slot', () => {
    expect(targetSlot({ kind: 'sandbox' })).toBe(SANDBOX_SLOT);
    expect(targetSlot({ kind: 'stage', stageId: 'c1-s2' })).toBe('c1-s2');
  });
});
