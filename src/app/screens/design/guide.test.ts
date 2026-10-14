import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import type { SessionState } from '@/app/flow';
import { analyzeMechanism } from '@/core/kinematics';
import { getStage, preflight, revealedHints, type RunResult } from '@/game';
import { pickTip } from '@/guide';
import {
  dismissTip,
  guideEvents,
  hintGhost,
  initialDesignGuide,
  installDesignGuide,
  noteOutcome,
  outcomeEvent,
  problemSelection,
  RUN_EVENTS_KEPT,
  setGhostShown,
  tutorialCallout,
  type DesignGuideState,
} from './guide';
import { createStore } from 'zustand/vanilla';

const result = (cleared: boolean, reason: RunResult['reason']) =>
  ({ cleared, reason }) as RunResult;

describe('試走の結果を一言の出来事に', () => {
  it('クリアは runCleared、失敗は理由つきの runFailed', () => {
    expect(outcomeEvent({ result: result(true, null) })).toEqual({ type: 'runCleared' });
    expect(outcomeEvent({ result: result(false, 'fallen') })).toEqual({
      type: 'runFailed',
      reason: 'fallen',
    });
  });

  it('スロットごとに覚え、古いものから捨てる', () => {
    let s = initialDesignGuide();
    for (let i = 0; i < RUN_EVENTS_KEPT + 2; i++) {
      s = noteOutcome(s, { slot: 'c1-s1', result: result(false, 'timeout') });
    }
    s = noteOutcome(s, { slot: 'c1-s2', result: result(true, null) });
    expect(s.runs['c1-s1']).toHaveLength(RUN_EVENTS_KEPT);
    expect(s.runs['c1-s2']).toEqual([{ type: 'runCleared' }]);
  });

  it('pickTip:別のスロットの失敗は持ち込まず、閉じた一言は出さない', () => {
    const stage = getStage('c1-s4')!;
    const design = stage.reference!;
    let s = noteOutcome(initialDesignGuide(), { slot: 'c1-s3', result: result(false, 'fallen') });
    // 1-4 の参考解は良い脚なので、1-3 の転倒は 1-4 の一言にならない
    const here = pickTip({ design, stage, events: guideEvents(s.runs['c1-s4'], s.dismissed) });
    expect(here?.id).not.toBe('fallen');
    s = noteOutcome(s, { slot: 'c1-s4', result: result(false, 'fallen') });
    const fallen = pickTip({ design, stage, events: guideEvents(s.runs['c1-s4'], s.dismissed) });
    expect(fallen?.id).toBe('fallen');
    s = dismissTip(s, 'fallen');
    expect(dismissTip(s, 'fallen')).toBe(s);
    const after = pickTip({ design, stage, events: guideEvents(s.runs['c1-s4'], s.dismissed) });
    expect(after?.id).not.toBe('fallen');
    // チュートリアルの吹き出しが出ている間は一言を出さない
    expect(
      pickTip({ design, stage, events: guideEvents(s.runs['c1-s4'], []), tutorialActive: true }),
    ).toBeNull();
  });
});

describe('ヒントの影', () => {
  const stage = getStage('c1-s3')!;
  const all = revealedHints(stage, 3);

  it('開いた影の中で一番進んだものを重ね、切り替えで隠せる', () => {
    expect(hintGhost(revealedHints(stage, 1))).toEqual({ ghost: null, shown: [] });
    const both = hintGhost(all);
    expect(both.shown).toEqual([2, 3]);
    expect(both.ghost).toBe(all[2]!.hint.kind === 'ghost' ? all[2]!.hint.design : null);
    const only2 = hintGhost(all, [3]);
    expect(only2.shown).toEqual([2]);
    expect(only2.ghost).toBe(all[1]!.hint.kind === 'ghost' ? all[1]!.hint.design : null);
    expect(hintGhost(all, [2, 3])).toEqual({ ghost: null, shown: [] });
  });

  it('切り替えはステージごと。同じ値なら状態を変えない', () => {
    let s: DesignGuideState = initialDesignGuide();
    s = setGhostShown(s, 'c1-s3', 3, false);
    expect(s.hiddenGhosts).toEqual({ 'c1-s3': [3] });
    expect(setGhostShown(s, 'c1-s3', 3, false)).toBe(s);
    s = setGhostShown(s, 'c1-s3', 3, true);
    expect(s.hiddenGhosts['c1-s3']).toEqual([]);
    expect(setGhostShown(s, 'c1-s3', 2, true)).toBe(s);
  });
});

describe('試走前チェックの問題の場所', () => {
  it('点と棒をそのまま選ぶ(なければ空)', () => {
    expect(problemSelection({ jointIds: ['B'], linkIds: ['l1'] })).toEqual({
      joints: ['B'],
      links: ['l1'],
    });
    expect(problemSelection({})).toEqual({ joints: [], links: [] });
  });

  it('場所のない自由度の問題は、解析のぐらつく点・余分な棒で示す', () => {
    const analysis = { looseJoints: ['B', 'C'], problemLinks: ['l2'] };
    expect(problemSelection({ code: 'dofLoose' }, analysis)).toEqual({
      joints: ['B', 'C'],
      links: [],
    });
    expect(problemSelection({ code: 'dofLocked' }, analysis)).toEqual({
      joints: [],
      links: ['l2'],
    });
    // 場所を持つ問題はそのまま
    expect(problemSelection({ code: 'dofLoose', jointIds: ['A'] }, analysis).joints).toEqual(['A']);
  });

  it('1-1 の壊れた機械:自由度の問題でぐらつく点(赤い点)を示す', () => {
    const stage = getStage('c1-s1')!;
    const design = stage.initialDesign!;
    const analysis = analyzeMechanism(design);
    const dof = preflight(stage, design, { analysis }).problems.find((p) => p.code === 'dofLoose');
    expect(dof).toBeDefined();
    expect(problemSelection(dof!, analysis).joints).toContain('B');
  });
});

describe('installDesignGuide', () => {
  it('試走の結果が出るたびに覚え、進行を消したら結果も忘れる', () => {
    const session = create<Pick<SessionState, 'lastOutcome'>>()(() => ({ lastOutcome: null }));
    const store = createStore<DesignGuideState>(initialDesignGuide);
    const off = installDesignGuide(session as never, store);
    const outcome = { slot: 'c1-s1', result: result(false, 'stalled') };
    session.setState({ lastOutcome: outcome as never });
    expect(store.getState().runs['c1-s1']).toEqual([{ type: 'runFailed', reason: 'stalled' }]);
    store.setState(dismissTip(store.getState(), 'noFoot'));
    session.setState({ lastOutcome: null });
    expect(store.getState().runs).toEqual({});
    expect(store.getState().dismissed).toEqual(['noFoot']);
    off();
    session.setState({ lastOutcome: outcome as never });
    expect(store.getState().runs).toEqual({});
  });
});

describe('チュートリアルが押してほしいもの', () => {
  const steps = getStage('c1-s1')!.tutorial!;
  const c13 = getStage('c1-s3')!.tutorial!;

  it('部品を置くステップでは、その道具を選ぶまで道具のボタン', () => {
    // 1-1 の 3:「リンク」を押して…
    expect(tutorialCallout(steps[2], 'select')).toEqual({ tool: 'link', testRun: false });
    expect(tutorialCallout(steps[2], 'link')).toEqual({ tool: null, testRun: false });
    // 1-3:固定点・クランク
    const fixed = c13.find((s) => s.until.kind === 'place' && s.until.part === 'fixed');
    const crank = c13.find((s) => s.until.kind === 'place' && s.until.part === 'crank');
    expect(tutorialCallout(fixed, 'select').tool).toBe('fixed');
    expect(tutorialCallout(crank, 'link').tool).toBe('crank');
  });

  it('試走で進むステップは試走ボタン。「次へ」のステップや終わった後は何も光らせない', () => {
    expect(tutorialCallout(steps[5], 'link')).toEqual({ tool: null, testRun: true });
    expect(tutorialCallout(steps[0], 'select')).toEqual({ tool: null, testRun: false });
    expect(tutorialCallout(null, 'select')).toEqual({ tool: null, testRun: false });
  });
});
