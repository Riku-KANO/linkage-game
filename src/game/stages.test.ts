import { describe, expect, it } from 'vitest';
import { analyzeMechanism, grublerDof } from '@/core/kinematics/analyze';
import { compileMechanism } from '@/core/kinematics/compile';
import { computeBill } from '@/core/model/parts';
import type { DesignDoc } from '@/core/model/types';
import { MAX_RPM } from '@/core/model/types';
import { hasKey } from '@/i18n';
import { ja } from '@/i18n/ja';
import { CHAPTERS, partsUpToChapter } from './chapters';
import { terrainHeightAt } from './courses';
import { footStance, walkDirection } from './gait';
import {
  getStage,
  maxStepUp,
  nextStageId,
  STAGES,
  stageLegs,
  stagesOfChapter,
  stageTextParams,
  startDesign,
} from './stages';
import type { StageDef } from './types';

const sameLegs = (a: DesignDoc['legs'], b: DesignDoc['legs']) =>
  a.count === b.count &&
  a.phaseStepDeg === b.phaseStepDeg &&
  a.spacing === b.spacing &&
  a.mirrorX === b.mirrorX;

/** 文言の {name} がすべて params にあるか */
function placeholdersFilled(key: string, params: Record<string, string | number>) {
  const s = ja[key] ?? '';
  const names = [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  return names.filter((n) => !(n in params));
}

function stageKeys(stage: StageDef): string[] {
  return [
    stage.titleKey,
    stage.descKey,
    ...stage.hints.map((h) => h.key),
    ...(stage.tutorial ?? []).map((s) => s.key),
  ];
}

const compileErrors = (d: DesignDoc) =>
  compileMechanism(d).issues.filter((i) => i.code !== 'floating-joint');

describe('stage list (GAME-1)', () => {
  it('has chapters 1 and 2 with 5 stages each, in order', () => {
    expect(STAGES).toHaveLength(10);
    for (const ch of [1, 2]) {
      const list = stagesOfChapter(ch);
      expect(list.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
      list.forEach((s) => expect(s.id).toBe(`c${ch}-s${s.order}`));
    }
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
    const sorted = [...STAGES].sort((a, b) => a.chapter - b.chapter || a.order - b.order);
    expect(sorted.map((s) => s.id)).toEqual(STAGES.map((s) => s.id));
    expect(getStage('c1-s1')?.order).toBe(1);
    expect(getStage('nope')).toBeUndefined();
    expect(nextStageId('c1-s5')).toBe('c2-s1');
    expect(nextStageId('c2-s5')).toBeNull();
  });

  it('only playable chapters have stages', () => {
    for (const c of CHAPTERS) {
      expect(stagesOfChapter(c.chapter).length > 0).toBe(c.playable);
      expect(hasKey(c.titleKey)).toBe(true);
      expect(hasKey(c.descKey)).toBe(true);
    }
  });
});

describe.each(STAGES.map((s) => [s.id, s] as const))('stage %s', (_id, stage) => {
  it('references existing i18n keys with all placeholders filled', () => {
    const params = stageTextParams(stage);
    for (const key of stageKeys(stage)) {
      expect(hasKey(key), key).toBe(true);
      expect(placeholdersFilled(key, params), key).toEqual([]);
    }
  });

  it('has a well-formed terrain', () => {
    const { terrain } = stage;
    for (const s of terrain.shapes) {
      if (s.kind === 'box') {
        for (let a = 0; a < 3; a++) {
          expect(Number.isFinite(s.min[a]!) && Number.isFinite(s.max[a]!)).toBe(true);
          expect(s.min[a]!).toBeLessThan(s.max[a]!);
        }
      } else {
        expect(s.x0).toBeLessThan(s.x1);
        expect(s.z0).toBeLessThan(s.z1);
        expect(s.bottom).toBeLessThan(Math.min(s.y0, s.y1));
      }
    }
    if (terrain.friction !== undefined) expect(terrain.friction).toBeGreaterThan(0);
    // スタートの 1.2m 手前からゴールの 0.5m 先まで、足元に地形がある
    for (let x = stage.start.x - 1.2; x <= stage.goal.x + 0.5; x += 0.05) {
      for (const z of [-0.6, 0, 0.6]) {
        expect(Number.isFinite(terrainHeightAt(terrain, x, z)), `x=${x} z=${z}`).toBe(true);
      }
    }
  });

  it('starts on level ground and has a sane goal', () => {
    const h0 = terrainHeightAt(stage.terrain, stage.start.x, stage.start.z);
    // 機体(前後 ±0.75m 程度)が平らな所に置かれる
    for (let x = stage.start.x - 1; x <= stage.start.x + 0.8; x += 0.05) {
      expect(terrainHeightAt(stage.terrain, x, stage.start.z)).toBeCloseTo(h0, 9);
    }
    expect(stage.goal.x - stage.start.x).toBeGreaterThanOrEqual(1);
    expect(Math.abs(stage.start.z)).toBeLessThan(0.5);
    expect(stage.timeLimit).toBeGreaterThan(0);
  });

  it('orders medal thresholds gold <= silver <= bronze', () => {
    for (const axis of ['time', 'parts', 'cost', 'energy'] as const) {
      const [g, s, b] = stage.medals[axis];
      expect(g, axis).toBeGreaterThan(0);
      expect(g, axis).toBeLessThanOrEqual(s);
      expect(s, axis).toBeLessThanOrEqual(b);
    }
    expect(stage.medals.time[2]).toBeLessThanOrEqual(stage.timeLimit);
    if (stage.budget !== null) {
      expect(stage.budget).toBeGreaterThan(0);
      expect(stage.medals.cost[2]).toBeLessThanOrEqual(stage.budget);
    }
  });

  it('allows only the parts and features of its chapter', () => {
    const avail = partsUpToChapter(stage.chapter);
    stage.parts.forEach((p) => expect(avail).toContain(p));
    expect(stage.features.legArray).toBe(stage.chapter >= 2);
  });

  it('has a valid reference solution (DOF 1, full rotation, walks forward)', () => {
    const ref = stage.reference;
    expect(ref).toBeDefined();
    if (!ref) return;
    expect(compileErrors(ref)).toEqual([]);
    expect(grublerDof(ref).dof).toBe(1);
    const a = analyzeMechanism(ref);
    expect(a.fullRotation).toBe(true);
    expect(ref.foot).not.toBeNull();
    expect(ref.motor.rpm).not.toBe(0);
    expect(Math.abs(ref.motor.rpm)).toBeLessThanOrEqual(MAX_RPM);
    const stance = footStance(a);
    expect(stance).not.toBeNull();
    expect(walkDirection(stance!, ref.motor.rpm)).toBe(1);
    if (!stage.features.legArray) expect(sameLegs(ref.legs, stageLegs(stage))).toBe(true);
    const bill = computeBill(ref);
    expect(bill.parts).toBeLessThanOrEqual(stage.medals.parts[2]);
    expect(bill.cost).toBeLessThanOrEqual(stage.medals.cost[2]);
    if (stage.budget !== null) expect(bill.cost).toBeLessThanOrEqual(stage.budget);
  });

  it('has a consistent initial design and locked joints', () => {
    const init = stage.initialDesign;
    if (!init) {
      expect(stage.lockedJoints ?? []).toEqual([]);
      return;
    }
    expect(compileErrors(init)).toEqual([]);
    if (!stage.features.legArray) expect(sameLegs(init.legs, stageLegs(stage))).toBe(true);
    const ids = new Set(init.joints.map((j) => j.id));
    (stage.lockedJoints ?? []).forEach((id) => expect(ids.has(id), id).toBe(true));
  });

  it('has three hints: a text, a placement ghost and a partial design', () => {
    const [h1, h2, h3] = stage.hints;
    expect(h1.kind).toBe('text');
    expect(h2.kind).toBe('ghost');
    expect(h3.kind).toBe('ghost');
    const ref = stage.reference!;
    for (const h of [h2, h3]) {
      expect(h.design.joints.length).toBeGreaterThan(0);
      expect(compileErrors(h.design)).toEqual([]);
      // 影は参考解の一部(同じ id・同じ位置)
      for (const j of h.design.joints) {
        const r = ref.joints.find((q) => q.id === j.id);
        expect(r, j.id).toBeDefined();
        expect([j.x, j.y, j.fixed]).toEqual([r!.x, r!.y, r!.fixed]);
      }
      for (const l of h.design.links) {
        expect(ref.links.find((q) => q.id === l.id)?.joints).toEqual(l.joints);
      }
    }
    expect(h3.design.links.length).toBeGreaterThanOrEqual(h2.design.links.length);
    expect(h3.design.links.length).toBeGreaterThan(0);
    expect(h3.design.links.length).toBeLessThan(ref.links.length);
  });

  it('starts from a fresh copy of the stage design', () => {
    const a = startDesign(stage);
    const b = startDesign(stage);
    expect(a).toEqual(b);
    a.joints.push({ id: 'zz', x: 0, y: 0, fixed: true });
    a.legs.count = 99;
    expect(startDesign(stage)).toEqual(b);
    if (!stage.initialDesign) {
      expect(a.links).toEqual([]);
      expect(sameLegs(b.legs, stageLegs(stage))).toBe(true);
    }
  });
});

describe('tutorial stages (U-05)', () => {
  it('are exactly the first three stages of chapter 1', () => {
    const withTutorial = STAGES.filter((s) => s.tutorial && s.tutorial.length > 0).map((s) => s.id);
    expect(withTutorial).toEqual(['c1-s1', 'c1-s2', 'c1-s3']);
  });

  it('give parts one by one, only parts of the stage, and end with a test run', () => {
    for (const id of ['c1-s1', 'c1-s2', 'c1-s3']) {
      const stage = getStage(id)!;
      const steps = stage.tutorial!;
      expect(steps[steps.length - 1]!.until.kind).toBe('testRun');
      const given = new Set<string>();
      for (const step of steps) {
        expect(step.give?.length ?? 0).toBeLessThanOrEqual(2);
        step.give?.forEach((p) => {
          expect(stage.parts).toContain(p);
          given.add(p);
        });
        if (step.until.kind === 'place') expect(given.has(step.until.part)).toBe(true);
      }
    }
  });
});

describe('repair and lesson stages', () => {
  const dofOf = (id: string) => grublerDof(getStage(id)!.initialDesign!).dof;

  it('c1-s1 is missing one link (DOF 2) and the reference adds it back', () => {
    const s = getStage('c1-s1')!;
    expect(dofOf('c1-s1')).toBe(2);
    expect(s.reference!.links.length).toBe(s.initialDesign!.links.length + 1);
  });

  it('c1-s2 has a crank too long to rotate; only the crank pin moved', () => {
    const s = getStage('c1-s2')!;
    expect(dofOf('c1-s2')).toBe(1);
    expect(analyzeMechanism(s.initialDesign!).fullRotation).toBe(false);
    const moved = s.initialDesign!.joints.filter((j) => {
      const r = s.reference!.joints.find((q) => q.id === j.id)!;
      return r.x !== j.x || r.y !== j.y;
    });
    expect(moved.map((j) => j.id)).toEqual(['A']);
    expect(s.lockedJoints).not.toContain('A');
  });

  it('c2-s1 starts with a foot lift lower than the step; the reference clears it', () => {
    const s = getStage('c2-s1')!;
    const step = maxStepUp(s) * 100;
    const liftOf = (d: DesignDoc) => footStance(analyzeMechanism(d))!.lift;
    expect(liftOf(s.initialDesign!)).toBeLessThan(step);
    expect(liftOf(s.reference!)).toBeGreaterThan(step + 5);
  });

  it('c2-s2 starts with a single leg; the reference uses the leg array', () => {
    const s = getStage('c2-s2')!;
    expect(s.initialDesign!.legs.count).toBe(1);
    expect(s.initialDesign!.legs.mirrorX).toBe(false);
    expect(s.reference!.legs.count).toBeGreaterThan(1);
  });

  it('c2-s3 has an extra link that locks the mechanism (DOF 0)', () => {
    const s = getStage('c2-s3')!;
    expect(dofOf('c2-s3')).toBe(0);
    expect(s.reference!.links.length).toBe(s.initialDesign!.links.length - 1);
  });

  it('chapter 2 introduces budgets; chapter 1 has none', () => {
    expect(stagesOfChapter(1).every((s) => s.budget === null)).toBe(true);
    expect(stagesOfChapter(2).some((s) => s.budget !== null)).toBe(true);
  });
});
