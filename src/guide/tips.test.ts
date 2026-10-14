import { describe, expect, it } from 'vitest';
import { analyzeMechanism } from '@/core/kinematics';
import { chebyshevLambda, fourBar, jansenLeg } from '@/core/model/presets';
import { createEmptyDesign, type DesignDoc } from '@/core/model/types';
import { initialProgress, getStage, type RunResult } from '@/game';
import { hasKey } from '@/i18n';
import { FIGURE_DESIGNS } from './figures/designs';
import { candidates, maxCrankLength, pickTip, type GuideEvent, type TipInput } from './tips';

const pick = (design: DesignDoc, rest: Omit<TipInput, 'design'> = {}) =>
  pickTip({ design, ...rest });

const withFoot = (d: DesignDoc, foot: string | null): DesignDoc => ({ ...d, foot });

describe('pickTip:組み始めの手引き', () => {
  it('白紙なら、棒の引き方', () => {
    const tip = pick(createEmptyDesign());
    expect(tip).toMatchObject({ id: 'empty', key: 'guide.tip.empty', severity: 'info' });
  });

  it('クリアしたことがある人には、白紙の一言を短くする', () => {
    const progress = initialProgress();
    progress.best['c1-s1'] = { stageId: 'c1-s1' } as RunResult;
    expect(pick(createEmptyDesign(), { progress })?.key).toBe('guide.tip.emptyShort');
  });

  it('チュートリアル中は何も言わない', () => {
    expect(pick(createEmptyDesign(), { tutorialActive: true })).toBeNull();
  });

  it('棒だけで固定点がない', () => {
    const d: DesignDoc = {
      ...createEmptyDesign(),
      joints: [
        { id: 'a', x: 0, y: 0, fixed: false },
        { id: 'b', x: 20, y: 0, fixed: false },
      ],
      links: [{ id: 'l', joints: ['a', 'b'] }],
    };
    expect(pick(d)?.id).toBe('noFixed');
  });

  it('固定点はあるがクランクがない', () => {
    const d = { ...FIGURE_DESIGNS.loopFourBar(), cranks: [] };
    expect(pick(d)).toMatchObject({ id: 'noCrank', severity: 'info' });
  });

  it('どこにもつながっていない棒がある', () => {
    const base = FIGURE_DESIGNS.loopFourBar();
    const d: DesignDoc = {
      ...base,
      joints: [
        ...base.joints,
        { id: 'P', x: 80, y: 10, fixed: false },
        { id: 'Q', x: 95, y: 10, fixed: false },
      ],
      links: [...base.links, { id: 'stray', joints: ['P', 'Q'] }],
    };
    const tip = pick(d);
    expect(tip?.id).toBe('floating');
    expect(tip?.jointIds).toEqual(expect.arrayContaining(['P', 'Q']));
  });
});

describe('pickTip:動かない理由', () => {
  it('自由度 2 以上:棒を足す', () => {
    const tip = pick(FIGURE_DESIGNS.loopFiveBar());
    expect(tip).toMatchObject({ id: 'dofLoose', severity: 'error', params: { dof: 2, need: 1 } });
    expect(tip?.jointIds).toEqual(expect.arrayContaining(['B', 'C']));
  });

  it('自由度 0:棒を外す(固まっている棒を示す)', () => {
    const tip = pick(FIGURE_DESIGNS.loopTriangle());
    expect(tip).toMatchObject({ id: 'dofLocked', severity: 'error', params: { dof: 0, extra: 1 } });
    expect(tip?.linkIds?.length).toBeGreaterThan(0);
  });

  it('特殊な寸法で動く自由度 0 は止めず、最後に一言だけ添える', () => {
    const d = withFoot(FIGURE_DESIGNS.doubleParallelogram(), 'B');
    const ids = [...candidates({ design: d })].map((c) => c.id);
    expect(ids).not.toContain('dofLocked');
    expect(ids).toContain('special');
  });

  it('一回転できない:グラスホフの条件からクランクの長さの目安を出す', () => {
    const tip = pick(FIGURE_DESIGNS.tooLongCrank());
    expect(tip).toMatchObject({
      id: 'noFullRotation',
      key: 'guide.tip.noFullRotationGrashof',
      severity: 'error',
      params: { crank: 28, max: 25 },
      linkIds: ['crank'],
    });
  });

  it('目安の長さにすると本当に一回転できる', () => {
    const fixed = fourBar(24, 35, 30, 40);
    expect(analyzeMechanism(fixed).fullRotation).toBe(true);
  });

  it('クランクの四節は回るのに先の棒が届かないときは、届かない棒を示す', () => {
    const base = FIGURE_DESIGNS.loopFourBar();
    const B = base.joints.find((j) => j.id === 'B')!;
    const d: DesignDoc = {
      ...base,
      joints: [
        ...base.joints,
        { id: 'E', x: B.x + 10, y: B.y + 1, fixed: false },
        { id: 'O3', x: B.x + 20, y: B.y, fixed: true },
      ],
      links: [...base.links, { id: 'be', joints: ['B', 'E'] }, { id: 'eo', joints: ['E', 'O3'] }],
    };
    const tip = pick(d);
    expect(tip).toMatchObject({ id: 'noFullRotation', key: 'guide.tip.noFullRotation' });
    expect(tip?.linkIds?.length).toBeGreaterThan(0);
  });
});

describe('pickTip:脚先', () => {
  it('脚先が決まっていない', () => {
    expect(pick(FIGURE_DESIGNS.loopFourBar())).toMatchObject({ id: 'noFoot', severity: 'info' });
  });

  it('脚先より下を通る点がある(脚先が地面に届かない)', () => {
    const tip = pick(withFoot(FIGURE_DESIGNS.goodLeg(), 'B'));
    expect(tip).toMatchObject({ id: 'footNotLowest', severity: 'warn' });
    expect(tip?.jointIds).toContain('F');
  });

  it('後ろへ歩く:モーターを逆に(四節の見本 rpm +30、ヤンセンを反時計回り)', () => {
    expect(pick(fourBar())).toMatchObject({ id: 'walksBackward', severity: 'warn' });
    const j = jansenLeg();
    expect(pick({ ...j, motor: { rpm: 40 } })?.id).toBe('walksBackward');
    expect(pick(j)).toBeNull();
  });

  it('段差のステージで足上げが低い(章 2-1 の最初の脚は 12cm、段差は 14cm)', () => {
    const stage = getStage('c2-s1')!;
    const tip = pick(stage.initialDesign!, { stage });
    expect(tip).toMatchObject({
      id: 'lowLiftStep',
      severity: 'warn',
      params: { lift: 12, step: 14 },
    });
    // 参考解は足上げが十分
    expect(pick(stage.reference!, { stage })).toBeNull();
    // 平らなステージでは言わない
    expect(pick(stage.initialDesign!, { stage: getStage('c1-s4')! })).toBeNull();
  });

  it('足上げがほとんどない:脚先が地面をこする', () => {
    const design = FIGURE_DESIGNS.goodLeg();
    const real = analyzeMechanism(design);
    const analysis = { ...real, foot: { ...real.foot!, lift: 2 } };
    expect(pick(design, { analysis })).toMatchObject({ id: 'lowLift', params: { lift: 2 } });
  });

  it('軌道の底が平らでない(チェビシェフの見本は底が丸い)', () => {
    expect(pick(chebyshevLambda())).toMatchObject({ id: 'noFlat', severity: 'info' });
  });

  it('良い脚なら何も言わない', () => {
    expect(pick(FIGURE_DESIGNS.goodLeg())).toBeNull();
    expect(pick(jansenLeg())).toBeNull();
  });
});

describe('pickTip:最近の出来事', () => {
  const stage = getStage('c2-s2')!;
  const oneLeg = stage.initialDesign!;
  const fell: GuideEvent = { type: 'runFailed', reason: 'fallen' };

  it('転んだら、脚列が使えるステージでは脚を増やす一言', () => {
    expect(pick(oneLeg, { stage })).toBeNull();
    expect(pick(oneLeg, { stage, events: [fell] })).toMatchObject({
      id: 'fallen',
      key: 'guide.tip.fallenLegs',
    });
  });

  it('脚列がまだ使えないステージでは、軌道で安定させる一言', () => {
    const c1 = getStage('c1-s4')!;
    expect(pick(c1.reference!, { stage: c1, events: [fell] })).toMatchObject({
      id: 'fallen',
      key: 'guide.tip.fallen',
    });
  });

  it('時間切れ・トルク不足', () => {
    const d = FIGURE_DESIGNS.goodLeg();
    expect(pick(d, { events: [{ type: 'runFailed', reason: 'timeout' }] })?.id).toBe('timeout');
    expect(pick(d, { events: [{ type: 'runFailed', reason: 'stalled' }] })?.id).toBe('stalled');
  });

  it('最後の試走がクリアなら、前の失敗は持ち出さない', () => {
    expect(pick(oneLeg, { stage, events: [fell, { type: 'runCleared' }] })).toBeNull();
  });

  it('閉じた一言は飛ばして、次の一言を出す', () => {
    const five = FIGURE_DESIGNS.loopFiveBar();
    expect(pick(five)?.id).toBe('dofLoose');
    expect(pick(five, { events: [{ type: 'tipDismissed', tip: 'dofLoose' }] })).toBeNull();
    const four = FIGURE_DESIGNS.loopFourBar();
    expect(pick(four, { events: [{ type: 'tipDismissed', tip: 'noFoot' }] })).toBeNull();
  });
});

describe('一言の文言', () => {
  it('どの一言にも文言がある', () => {
    const keys = [
      'empty',
      'emptyShort',
      'noFixed',
      'noCrank',
      'floating',
      'dofLoose',
      'dofLocked',
      'noFullRotation',
      'noFullRotationGrashof',
      'noFoot',
      'footNotLowest',
      'walksBackward',
      'lowLiftStep',
      'fallen',
      'fallenLegs',
      'timeout',
      'stalled',
      'lowLift',
      'noFlat',
      'special',
    ];
    for (const k of keys) expect(hasKey(`guide.tip.${k}`), k).toBe(true);
  });

  it('maxCrankLength:クランクを最短にして s + l ≤ p + q', () => {
    const g = analyzeMechanism(FIGURE_DESIGNS.tooLongCrank()).grashof[0]!;
    expect(maxCrankLength(g)).toBeCloseTo(25, 6);
  });
});
