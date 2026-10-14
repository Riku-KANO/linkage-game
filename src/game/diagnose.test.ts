import { describe, expect, it } from 'vitest';
import { hasKey } from '@/i18n';
import { basicLeg, jansenMachine, SINGLE_LEG, withLegs } from './designs';
import {
  diagnoseFailure,
  diagnosisFor,
  estimateComHeight,
  FAIL_CAUSES,
  isTopHeavy,
  supportMargin,
} from './diagnose';
import { preflight } from './preflight';
import { getStage } from './stages';
import type { RunSummary } from './types';

const stage = getStage('c1-s4')!;
const walker = stage.reference!;

const run = (patch: Partial<RunSummary> = {}): RunSummary => ({
  time: 30,
  distance: 1.2,
  reachedGoal: false,
  fallen: false,
  stalled: false,
  jammed: false,
  energy: 80,
  ...patch,
});

describe('failure diagnosis (GAME-6)', () => {
  it('returns null for a cleared run', () => {
    expect(
      diagnoseFailure(stage, walker, run({ reachedGoal: true, time: 8, distance: 3 })),
    ).toBeNull();
  });

  it('names one short reason with Japanese text and an advice', () => {
    for (const cause of FAIL_CAUSES) {
      const d = diagnosisFor(cause);
      expect(d.cause).toBe(cause);
      expect(hasKey(d.key), d.key).toBe(true);
      expect(hasKey(d.adviceKey), d.adviceKey).toBe(true);
    }
    expect(diagnosisFor('stalled').key).toBe('game.fail.stalled');
  });

  it('reports torque shortage when the motor stalled', () => {
    expect(diagnoseFailure(stage, walker, run({ stalled: true }))?.cause).toBe('stalled');
  });

  it('reports a jammed mechanism', () => {
    expect(diagnoseFailure(stage, walker, run({ jammed: true, stalled: true }))?.cause).toBe(
      'jammed',
    );
  });

  it('reports a timeout, or walking the wrong way', () => {
    expect(diagnoseFailure(stage, walker, run())?.cause).toBe('timeout');
    expect(diagnoseFailure(stage, walker, run({ distance: -0.8 }))?.cause).toBe('wrongWay');
    // ゴールしても制限時間を過ぎれば時間切れ
    expect(
      diagnoseFailure(stage, walker, run({ reachedGoal: true, time: stage.timeLimit + 1 }))?.cause,
    ).toBe('timeout');
  });

  it('reports over budget', () => {
    const s = getStage('c2-s5')!;
    expect(diagnoseFailure(s, jansenMachine(), run({ reachedGoal: true, time: 9 }))?.cause).toBe(
      'overBudget',
    );
  });

  it('reports an invalid design when the preflight failed', () => {
    const s = getStage('c1-s1')!;
    const d = s.initialDesign!;
    expect(diagnoseFailure(s, d, run(), { preflight: preflight(s, d) })?.cause).toBe('invalid');
  });

  it('tells a top-heavy machine from an ordinary fall', () => {
    // 脚が 1 本の機械は横に支えがない
    const single = getStage('c2-s2')!.initialDesign!;
    expect(diagnoseFailure(getStage('c2-s2')!, single, run({ fallen: true }))?.cause).toBe(
      'topHeavy',
    );
    // 標準の脚列の四節リンク機は、重心が低ければただの転倒
    expect(diagnoseFailure(stage, walker, run({ fallen: true, comHeight: 0.45 }))?.cause).toBe(
      'fallen',
    );
    // 同じ機械でも重心がとても高ければ「重心が高い」
    expect(diagnoseFailure(stage, walker, run({ fallen: true, comHeight: 3 }))?.cause).toBe(
      'topHeavy',
    );
  });
});

describe('stability helpers', () => {
  it('measures the support margin from the leg array and the stance', () => {
    const wide = supportMargin(basicLeg())!;
    expect(wide.z).toBeCloseTo(0.55 + 0.02, 6);
    expect(wide.x).toBeGreaterThan(0.4);
    const one = supportMargin(withLegs(basicLeg(), SINGLE_LEG))!;
    expect(one.z).toBeCloseTo(0.02, 6);
    // 前後反転なしの四節脚は、足が軸より前にしかないので前後の余裕が負
    expect(one.x).toBeLessThan(0);
  });

  it('estimates the COM height from the leg length', () => {
    expect(estimateComHeight(basicLeg())).toBeCloseTo(0.457, 2);
    expect(estimateComHeight(jansenMachine())).toBeCloseTo(0.918, 2);
  });

  it('flags only narrow or tall machines as top heavy', () => {
    expect(isTopHeavy(basicLeg(), 0.46)).toBe(false);
    expect(isTopHeavy(jansenMachine(), 0.92)).toBe(false);
    expect(isTopHeavy(withLegs(basicLeg(), SINGLE_LEG), 0.46)).toBe(true);
    expect(isTopHeavy(basicLeg(), 5)).toBe(true);
  });
});
