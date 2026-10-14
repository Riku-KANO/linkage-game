import { describe, expect, it } from 'vitest';
import {
  advanceTutorial,
  diagnoseFailure,
  evaluateRun,
  getStage,
  initialProgress,
  isStageUnlocked,
  nextHint,
  preflight,
  progressReducer,
  startDesign,
  startTutorial,
  tutorialSnapshot,
  tutorialTextKey,
  type RunSummary,
} from '@/game';

describe('game public API', () => {
  it('plays the first stage end to end', () => {
    const stage = getStage('c1-s1')!;
    const design = startDesign(stage);
    let tut = startTutorial(stage.tutorial!, tutorialSnapshot(design));
    expect(tutorialTextKey(stage.tutorial!, tut)).toBe('game.stage.c1-s1.tut.1');
    // 壊れたままでは試走できない
    expect(preflight(stage, design).ok).toBe(false);
    expect(nextHint(stage, 0)?.level).toBe(1);
    // 直す(足りないリンクをつなぐ)
    const fixed = { ...design, links: [...design.links, { id: 'l1', joints: ['O4', 'B'] }] };
    tut = advanceTutorial(stage.tutorial!, tut, { type: 'click' });
    tut = advanceTutorial(stage.tutorial!, tut, { type: 'click' });
    tut = advanceTutorial(stage.tutorial!, tut, {
      type: 'design',
      snapshot: tutorialSnapshot(fixed),
    });
    expect(tutorialTextKey(stage.tutorial!, tut)).toBe('game.stage.c1-s1.tut.6');
    expect(preflight(stage, fixed).ok).toBe(true);
    // 試走の結果を評価して記録する
    const summary: RunSummary = {
      time: 6,
      distance: 1.55,
      reachedGoal: true,
      fallen: false,
      stalled: false,
      jammed: false,
      energy: 70,
    };
    const result = evaluateRun(stage, fixed, summary);
    expect(result.cleared).toBe(true);
    expect(diagnoseFailure(stage, fixed, summary)).toBeNull();
    const progress = progressReducer(initialProgress(), { type: 'record', result });
    expect(isStageUnlocked(progress, 'c1-s2')).toBe(true);
  });
});
