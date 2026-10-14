import { describe, expect, it } from 'vitest';
import { compileMechanism } from '@/core/kinematics/compile';
import { hasKey } from '@/i18n';
import { hintLabelKey, nextHint, revealedHints, suggestHint } from './hints';
import { getStage, STAGES } from './stages';

describe('hints (GAME-4)', () => {
  const stage = getStage('c1-s1')!;

  it('reveals the three levels in order, then nothing', () => {
    const h1 = nextHint(stage, 0);
    expect(h1).toMatchObject({ level: 1, labelKey: 'game.hint.level.1' });
    expect(h1!.hint.kind).toBe('text');
    expect(nextHint(stage, 1)).toMatchObject({ level: 2, hint: { kind: 'ghost' } });
    expect(nextHint(stage, 2)).toMatchObject({ level: 3, hint: { kind: 'ghost' } });
    expect(nextHint(stage, 3)).toBeNull();
    expect(nextHint(stage, 10)).toBeNull();
    expect(nextHint(stage, -1)?.level).toBe(1);
  });

  it('lists the revealed hints', () => {
    expect(revealedHints(stage, 0)).toEqual([]);
    expect(revealedHints(stage, 2).map((h) => h.level)).toEqual([1, 2]);
    expect(revealedHints(stage, 5).map((h) => h.level)).toEqual([1, 2, 3]);
  });

  it('has labels for every level', () => {
    for (const level of [1, 2, 3] as const) expect(hasKey(hintLabelKey(level))).toBe(true);
  });

  it.each(STAGES.map((s) => [s.id, s] as const))('ghosts of %s compile', (_id, s) => {
    for (const h of revealedHints(s, 3)) {
      expect(hasKey(h.hint.key)).toBe(true);
      if (h.hint.kind !== 'ghost') continue;
      const issues = compileMechanism(h.hint.design).issues;
      expect(issues.filter((i) => i.code !== 'floating-joint')).toEqual([]);
    }
  });

  it('suggests the next hint after repeated failures or a long time', () => {
    expect(suggestHint(stage, { revealed: 0, failedRuns: 0, seconds: 30 })).toBe(false);
    expect(suggestHint(stage, { revealed: 0, failedRuns: 2, seconds: 30 })).toBe(true);
    expect(suggestHint(stage, { revealed: 0, failedRuns: 0, seconds: 200 })).toBe(true);
    // 次のレベルは、失敗と時間がさらに積み重なってから
    expect(suggestHint(stage, { revealed: 1, failedRuns: 2, seconds: 200 })).toBe(false);
    expect(suggestHint(stage, { revealed: 1, failedRuns: 4, seconds: 200 })).toBe(true);
    expect(suggestHint(stage, { revealed: 3, failedRuns: 99, seconds: 9999 })).toBe(false);
  });
});
