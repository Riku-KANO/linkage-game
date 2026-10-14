import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzeMechanism } from '@/core/kinematics/analyze';
import type { DesignDoc } from '@/core/model/types';
import { createRapierTerrain } from '@/core/sim/terrain';
import type { TerrainCollider } from '@/core/sim/types';
import { withJointAt, withLegs } from './designs';
import { evaluateRun } from './evaluate';
import { preflight } from './preflight';
import { runStage } from './run';
import { getStage, startDesign } from './stages';

/**
 * PLAY-1・PLAY-3:チュートリアルの吹き出しやヒント 3 の言うとおりに作った機械が、本物の sim で
 * クリアできること(ヒント 3 は「本当に先へ進める」ものにする)。
 * 初めての人は寸法をぴったりには合わせないので、吹き出しの数字から少しずれた機械も試す。
 * (ブラウザで実際に操作する版は e2e/playtest/*.spec.ts)
 */

const terrains = new Map<string, TerrainCollider>();
beforeAll(async () => {
  for (const id of ['c1-s2', 'c1-s3', 'c1-s4', 'c1-s5', 'c2-s2', 'c2-s4', 'c2-s5']) {
    terrains.set(id, await createRapierTerrain(getStage(id)!.terrain));
  }
});
afterAll(() => {
  for (const t of terrains.values()) t.dispose?.();
});

function clears(stageId: string, design: DesignDoc): boolean {
  const stage = getStage(stageId)!;
  if (!preflight(stage, design).ok) return false;
  const { summary } = runStage(stage, design, terrains.get(stageId)!);
  return evaluateRun(stage, design, summary).cleared;
}

type P = { x: number; y: number };

/**
 * 1-3 の吹き出しの組み方:固定点 2 つ(left・right)、left から上へ短い棒(クランク)、
 * クランクの先から右下へ長い棒(先が脚先)、長い棒の途中(t)の点と right をつなぐ棒。
 * エディタで組んだときと同じ形(点・棒の id はエディタの付け方)。回転数は白紙の既定のまま。
 */
function tutorialLeg(
  o: { right: P; crank: number; foot: P; t: number },
  stageId = 'c1-s3',
): DesignDoc {
  const d = startDesign(getStage(stageId)!);
  const tip = { x: 0, y: o.crank };
  const mid = { x: tip.x + (o.foot.x - tip.x) * o.t, y: tip.y + (o.foot.y - tip.y) * o.t };
  d.joints = [
    { id: 'j1', x: 0, y: 0, fixed: true },
    { id: 'j2', x: o.right.x, y: o.right.y, fixed: true },
    { id: 'j3', ...tip, fixed: false },
    { id: 'j4', ...o.foot, fixed: false },
    { id: 'j5', ...mid, fixed: false },
  ];
  d.links = [
    { id: 'l1', joints: ['j1', 'j3'] },
    { id: 'l2', joints: ['j3', 'j4', 'j5'] },
    { id: 'l3', joints: ['j5', 'j2'] },
  ];
  d.cranks = [{ id: 'c1', link: 'l1', pivot: 'j1', phase: 0 }];
  d.foot = 'j4';
  return d;
}

describe('the machine the 1-3 tutorial describes walks to the goal', () => {
  // 吹き出し:右の固定点は右へ 40cm・上へ 20cm、クランク 10cm、長い棒は右へ 20〜30cm・下へ 50cm、
  // 点は「まん中より少し下」
  const asTold = { right: { x: 40, y: 20 }, crank: 10, foot: { x: 25, y: -40 }, t: 0.6 };

  it('as told, with the default motor', () => {
    const d = tutorialLeg(asTold);
    expect(d.motor.rpm).toBeGreaterThan(0);
    const a = analyzeMechanism(d);
    expect(a.dof).toBe(1);
    expect(a.fullRotation).toBe(true);
    expect(preflight(getStage('c1-s3')!, d).problems).toEqual([]);
    expect(clears('c1-s3', d)).toBe(true);
  });

  it('also when a newcomer is a few centimetres off', () => {
    const variants = [
      { ...asTold, right: { x: 40, y: 10 } },
      { ...asTold, right: { x: 40, y: 30 } },
      { ...asTold, right: { x: 35, y: 20 } },
      { ...asTold, right: { x: 45, y: 20 } },
      { ...asTold, crank: 8 },
      { ...asTold, crank: 12 },
      { ...asTold, foot: { x: 20, y: -40 } },
      { ...asTold, foot: { x: 30, y: -40 } },
      { ...asTold, foot: { x: 25, y: -35 } },
      { ...asTold, foot: { x: 25, y: -45 } },
      { ...asTold, t: 0.5 },
      { ...asTold, t: 0.7 },
    ];
    const failed = variants.filter((v) => !clears('c1-s3', tutorialLeg(v)));
    expect(failed).toEqual([]);
  });
});

describe('the 1-2 tutorial: shortening the crank by about half clears', () => {
  it.each([0.4, 0.5, 0.55])('crank pin moved to %s of its length along the crank', (keep) => {
    const stage = getStage('c1-s2')!;
    const start = startDesign(stage);
    const a = start.joints.find((j) => j.id === 'A')!;
    const o = start.joints.find((j) => j.id === 'O2')!;
    const d = withJointAt(
      start,
      'A',
      Math.round(o.x + (a.x - o.x) * keep),
      Math.round(o.y + (a.y - o.y) * keep),
    );
    expect(clears('c1-s2', d)).toBe(true);
  });
});

/** ヒント 3 の影の点(固定点 2 つ・クランクの先・脚先)を目印に、1-3 と同じ手順で組んだ機械 */
function legFromHintGhost(stageId: string, t: number, rpm: number): DesignDoc {
  const ghost = getStage(stageId)!.hints[2].design;
  const at = (id: string) => {
    const j = ghost.joints.find((q) => q.id === id)!;
    return { x: j.x, y: j.y };
  };
  const o2 = at('O2');
  const rel = (p: P) => ({ x: p.x - o2.x, y: p.y - o2.y });
  const tip = rel(at('A'));
  expect(tip.x).toBeCloseTo(0, 6); // クランクは真上(tutorialLeg と同じ)
  const d = tutorialLeg({ right: rel(at('O4')), crank: tip.y, foot: rel(at('F')), t }, stageId);
  return { ...d, motor: { rpm } };
}

describe('hint 3 really unblocks (PLAY-3)', () => {
  it.each([
    // [ステージ, 吹き出しの回転数]:「まん中より少し下」は 0.6 前後
    ['c1-s3', 30],
    ['c1-s4', 60],
    ['c1-s5', 60],
  ] as const)('%s: build the 1-3 way on the hint-3 points at %s rpm', (stageId, rpm) => {
    for (const t of [0.6, 0.7])
      expect(clears(stageId, legFromHintGhost(stageId, t, rpm)), `t=${t}`).toBe(true);
  });

  it('c2-s2: the leg array the hint names (spacing left as it was)', () => {
    const stage = getStage('c2-s2')!;
    const start = startDesign(stage);
    const d = withLegs(start, { ...start.legs, count: 6, phaseStepDeg: 120, mirrorX: true });
    expect(clears('c2-s2', d)).toBe(true);
  });

  it('c2-s4 / c2-s5: the machines of 2-3 / 2-1 reused through JSON', () => {
    expect(clears('c2-s4', getStage('c2-s3')!.reference!)).toBe(true);
    expect(clears('c2-s5', getStage('c2-s1')!.reference!)).toBe(true);
  });
});
