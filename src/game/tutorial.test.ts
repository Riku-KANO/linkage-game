import { describe, expect, it } from 'vitest';
import { createEmptyDesign } from '@/core/model/types';
import { basicLeg } from './designs';
import { getStage } from './stages';
import {
  advanceTutorial,
  currentStep,
  givenParts,
  isTutorialDone,
  startTutorial,
  tutorialAllowedParts,
  tutorialSnapshot,
  tutorialTextKey,
} from './tutorial';
import type { PartCounts, TutorialSnapshot, TutorialState, TutorialStep } from './types';

const snap = (parts: Partial<PartCounts>, dof = 0, fullRotation = false): TutorialSnapshot => ({
  parts: { link: 0, pin: 0, fixed: 0, crank: 0, ...parts },
  dof,
  fullRotation,
});

describe('tutorialSnapshot', () => {
  it('reads part counts, DOF and full rotation from a design', () => {
    expect(tutorialSnapshot(basicLeg())).toEqual(
      snap({ link: 3, pin: 4, fixed: 2, crank: 1 }, 1, true),
    );
    expect(tutorialSnapshot(createEmptyDesign())).toEqual(snap({}, 0, false));
    const broken = getStage('c1-s2')!.initialDesign!;
    expect(tutorialSnapshot(broken).fullRotation).toBe(false);
    // クランクがない機構は「一回転できる」とみなさない
    expect(tutorialSnapshot({ ...basicLeg(), cranks: [] }).fullRotation).toBe(false);
  });
});

describe('tutorial engine (GAME-5)', () => {
  it('walks through the repair tutorial of c1-s1', () => {
    const stage = getStage('c1-s1')!;
    const steps = stage.tutorial!;
    const key = (s: TutorialState) => tutorialTextKey(steps, s);
    let s = startTutorial(steps, tutorialSnapshot(stage.initialDesign!));
    expect(key(s)).toBe('game.stage.c1-s1.tut.1');
    expect(givenParts(steps, s)).toEqual([]);
    // 設計の変化ではクリックのステップは進まない
    s = advanceTutorial(steps, s, {
      type: 'design',
      snapshot: tutorialSnapshot(stage.initialDesign!),
    });
    expect(key(s)).toBe('game.stage.c1-s1.tut.1');
    s = advanceTutorial(steps, s, { type: 'testRun' });
    expect(key(s)).toBe('game.stage.c1-s1.tut.1');
    s = advanceTutorial(steps, s, { type: 'click' });
    s = advanceTutorial(steps, s, { type: 'click' });
    expect(key(s)).toBe('game.stage.c1-s1.tut.3');
    expect(givenParts(steps, s)).toEqual(['link', 'pin']);
    // リンクをつなぐと、自由度 1・一回転を満たすので試走のステップまで進む
    s = advanceTutorial(steps, s, { type: 'design', snapshot: tutorialSnapshot(stage.reference!) });
    expect(key(s)).toBe('game.stage.c1-s1.tut.6');
    expect(currentStep(steps, s)?.until.kind).toBe('testRun');
    expect(isTutorialDone(steps, s)).toBe(false);
    s = advanceTutorial(steps, s, { type: 'testRun' });
    expect(isTutorialDone(steps, s)).toBe(true);
    expect(key(s)).toBeNull();
    expect(currentStep(steps, s)).toBeNull();
    expect(givenParts(steps, s)).toEqual(['link', 'pin']);
  });

  it('stops on the DOF step when the new link does not fix the machine', () => {
    const stage = getStage('c1-s1')!;
    const steps = stage.tutorial!;
    let s = startTutorial(steps, snap({ link: 2, pin: 2, fixed: 2, crank: 1 }, 2));
    s = advanceTutorial(steps, s, { type: 'click' });
    s = advanceTutorial(steps, s, { type: 'click' });
    s = advanceTutorial(steps, s, {
      type: 'design',
      snapshot: snap({ link: 3, pin: 3, fixed: 2, crank: 1 }, 2),
    });
    expect(tutorialTextKey(steps, s)).toBe('game.stage.c1-s1.tut.4');
    s = advanceTutorial(steps, s, {
      type: 'design',
      snapshot: snap({ link: 3, pin: 4, fixed: 2, crank: 1 }, 1, true),
    });
    expect(tutorialTextKey(steps, s)).toBe('game.stage.c1-s1.tut.6');
  });

  it('gives parts one by one while building from scratch (c1-s3)', () => {
    const stage = getStage('c1-s3')!;
    const steps = stage.tutorial!;
    const allowed = (st: TutorialState) => tutorialAllowedParts(stage, st);
    const key = (st: TutorialState) => tutorialTextKey(steps, st);
    const design = (parts: Partial<PartCounts>, dof = 0, rot = false) =>
      ({ type: 'design', snapshot: snap(parts, dof, rot) }) as const;
    let s = startTutorial(steps, snap({}));
    s = advanceTutorial(steps, s, { type: 'click' });
    expect(allowed(s)).toEqual(['fixed']);
    s = advanceTutorial(steps, s, design({ fixed: 1 }));
    expect(currentStep(steps, s)?.give).toEqual(['fixed']);
    s = advanceTutorial(steps, s, design({ fixed: 2 }));
    // クランクの道具はリンクがないと使えないので、先にリンク(短い棒)を渡す
    expect(key(s)).toBe('game.stage.c1-s3.tut.3');
    expect(allowed(s)).toEqual(['link', 'pin', 'fixed']);
    s = advanceTutorial(steps, s, design({ fixed: 2, link: 1, pin: 1 }, 1));
    expect(key(s)).toBe('game.stage.c1-s3.tut.4');
    expect(allowed(s)).toEqual(['link', 'pin', 'fixed', 'crank']);
    s = advanceTutorial(steps, s, design({ fixed: 2, link: 1, pin: 1, crank: 1 }, 1, true));
    expect(key(s)).toBe('game.stage.c1-s3.tut.5');
    // 長い棒(連結棒)でぐらつく
    s = advanceTutorial(steps, s, design({ fixed: 2, link: 2, pin: 2, crank: 1 }, 2));
    expect(key(s)).toBe('game.stage.c1-s3.tut.6');
    // 右の固定点とつないだつもりが、棒の先が点にはまっていない
    const loose = advanceTutorial(steps, s, design({ fixed: 2, link: 3, pin: 3, crank: 1 }, 3));
    expect(key(loose)).toBe('game.stage.c1-s3.tut.7');
    // 自由度 1 でも一回転できない
    const stuck = advanceTutorial(steps, loose, design({ fixed: 2, link: 3, pin: 4, crank: 1 }, 1));
    expect(key(stuck)).toBe('game.stage.c1-s3.tut.8');
    // うまくつながれば、自由度と一回転のステップは飛ばして脚先の説明へ
    s = advanceTutorial(steps, s, design({ fixed: 2, link: 3, pin: 4, crank: 1 }, 1, true));
    expect(key(s)).toBe('game.stage.c1-s3.tut.9');
    expect(
      advanceTutorial(steps, stuck, design({ fixed: 2, link: 3, pin: 4, crank: 1 }, 1, true)),
    ).toEqual(s);
    s = advanceTutorial(steps, s, { type: 'click' });
    expect(key(s)).toBe('game.stage.c1-s3.tut.10');
    s = advanceTutorial(steps, s, { type: 'testRun' });
    expect(isTutorialDone(steps, s)).toBe(true);
    expect(allowed(s)).toEqual(stage.parts);
  });

  it('skips steps whose state condition already holds at the start', () => {
    const steps: TutorialStep[] = [
      { key: 'a', until: { kind: 'dof', value: 1 } },
      { key: 'b', until: { kind: 'fullRotation' } },
      { key: 'c', until: { kind: 'click' } },
    ];
    expect(tutorialTextKey(steps, startTutorial(steps, snap({}, 1, true)))).toBe('c');
    expect(tutorialTextKey(steps, startTutorial(steps, snap({}, 1, false)))).toBe('b');
    // 一回転には自由度 1 も必要
    const loose = startTutorial(steps.slice(1), snap({}, 2, true));
    expect(tutorialTextKey(steps.slice(1), loose)).toBe('b');
  });

  it('is pure and allows all stage parts on stages without a tutorial', () => {
    const stage = getStage('c1-s1')!;
    const steps = stage.tutorial!;
    const s0 = startTutorial(steps, snap({}));
    const copy = structuredClone(s0);
    advanceTutorial(steps, s0, { type: 'click' });
    expect(s0).toEqual(copy);
    const plain = getStage('c1-s4')!;
    expect(tutorialAllowedParts(plain, null)).toEqual(plain.parts);
    expect(isTutorialDone([], startTutorial([], snap({})))).toBe(true);
  });
});
