import { describe, expect, it } from 'vitest';
import { analyzeMechanism } from '@/core/kinematics/analyze';
import type { DesignDoc } from '@/core/model/types';
import { createEmptyDesign } from '@/core/model/types';
import { hasKey, t } from '@/i18n';
import { basicLeg, jansenMachine, withLegs, withRpm } from './designs';
import { partCounts, preflight, usedParts } from './preflight';
import { getStage, STAGES } from './stages';
import type { PreflightResult, StageDef } from './types';

const stage = (id: string): StageDef => getStage(id)!;
const codes = (r: PreflightResult) => r.problems.map((p) => p.code);
const errors = (r: PreflightResult) =>
  r.problems.filter((p) => p.severity === 'error').map((p) => p.code);

describe('preflight (GAME-2)', () => {
  it.each(STAGES.map((s) => [s.id, s] as const))(
    'passes the reference of %s without any problem',
    (_id, s) => {
      const r = preflight(s, s.reference!);
      expect(r.problems).toEqual([]);
      expect(r.ok).toBe(true);
    },
  );

  it('blocks the broken machines of the repair stages with the right problem', () => {
    const first = (id: string) => preflight(stage(id), stage(id).initialDesign!).problems[0];
    expect(first('c1-s1')).toMatchObject({
      code: 'dofLoose',
      severity: 'error',
      params: { dof: 2 },
    });
    expect(first('c1-s2')).toMatchObject({ code: 'noFullRotation', severity: 'error' });
    expect(first('c2-s3')).toMatchObject({
      code: 'dofLocked',
      severity: 'error',
      params: { dof: 0 },
    });
    expect(preflight(stage('c1-s1'), stage('c1-s1').initialDesign!).ok).toBe(false);
  });

  it('lets a lesson machine that breaks only in the run through (single leg)', () => {
    const s = stage('c2-s2');
    expect(preflight(s, s.initialDesign!).ok).toBe(true);
  });

  it('rejects an empty design', () => {
    const r = preflight(stage('c1-s3'), createEmptyDesign());
    expect(codes(r)).toEqual(['empty']);
    expect(r.ok).toBe(false);
  });

  it('requires a crank', () => {
    const d: DesignDoc = { ...basicLeg(), cranks: [] };
    expect(errors(preflight(stage('c1-s3'), d))).toEqual(['noCrank']);
  });

  it('reports structural problems with the analysis message', () => {
    const base = basicLeg();
    const d: DesignDoc = { ...base, cranks: [{ id: 'm', link: 'crank', pivot: 'A', phase: 0 }] };
    const r = preflight(stage('c1-s3'), d);
    expect(r.problems[0]).toMatchObject({
      code: 'mechanism',
      key: 'analysis.issue.crank-pivot-not-fixed',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects parts the stage does not allow, naming the part', () => {
    const s: StageDef = { ...stage('c1-s3'), parts: ['link', 'pin', 'fixed'] };
    const r = preflight(s, basicLeg());
    const p = r.problems.find((q) => q.code === 'partNotAllowed');
    expect(p?.params?.part).toBe(t('game.part.crank'));
    expect(r.ok).toBe(false);
    // チュートリアルなどで、さらに絞り込める
    const r2 = preflight(stage('c1-s3'), basicLeg(), { allowedParts: ['link', 'pin', 'crank'] });
    expect(r2.problems.filter((q) => q.code === 'partNotAllowed')).toHaveLength(1);
  });

  it('locks the leg array before chapter 2', () => {
    const d = withLegs(basicLeg(), { count: 2, phaseStepDeg: 180, spacing: 22, mirrorX: true });
    expect(errors(preflight(stage('c1-s4'), d))).toEqual(['legArrayLocked']);
    expect(errors(preflight(stage('c2-s1'), d))).toEqual([]);
  });

  it('checks the budget', () => {
    const budget = stage('c2-s5').budget!;
    const r = preflight(stage('c2-s5'), jansenMachine());
    const p = r.problems.find((q) => q.code === 'overBudget');
    expect(p).toBeDefined();
    expect(p!.params).toMatchObject({ budget });
    expect(Number(p!.params!.cost)).toBeGreaterThan(budget);
    expect(r.ok).toBe(false);
  });

  it('checks the motor speed', () => {
    expect(errors(preflight(stage('c1-s4'), withRpm(basicLeg(), 0)))).toEqual(['motorStopped']);
    expect(errors(preflight(stage('c1-s4'), withRpm(basicLeg(), -200)))).toEqual(['rpmTooHigh']);
  });

  it('warns (without blocking) about walking backward and a missing foot', () => {
    const back = preflight(stage('c1-s4'), withRpm(basicLeg(), 60));
    expect(back.ok).toBe(true);
    expect(back.problems).toEqual([
      expect.objectContaining({ code: 'walksBackward', severity: 'warn' }),
    ]);
    const noFoot = preflight(stage('c1-s4'), { ...basicLeg(), foot: null });
    expect(noFoot.ok).toBe(true);
    expect(codes(noFoot)).toEqual(['noFoot']);
  });

  it('allows DOF 2 only once springs are available (chapter 5 rule)', () => {
    const base = stage('c1-s1');
    const loose = base.initialDesign!;
    const withSpring: StageDef = { ...base, parts: [...base.parts, 'spring'] };
    expect(errors(preflight(base, loose))).toContain('dofLoose');
    expect(errors(preflight(withSpring, loose))).not.toContain('dofLoose');
  });

  it('reuses a precomputed analysis', () => {
    const s = stage('c1-s2');
    const d = s.initialDesign!;
    expect(preflight(s, d, { analysis: analyzeMechanism(d) })).toEqual(preflight(s, d));
  });

  it('uses existing i18n keys for every problem', () => {
    const designs = [
      createEmptyDesign(),
      { ...basicLeg(), cranks: [] },
      withRpm(basicLeg(), 0),
      withRpm(basicLeg(), 60),
      { ...basicLeg(), foot: null },
      jansenMachine(),
      ...STAGES.flatMap((s) => (s.initialDesign ? [s.initialDesign] : [])),
    ];
    for (const s of STAGES)
      for (const d of designs)
        for (const p of preflight(s, d).problems) expect(hasKey(p.key), p.key).toBe(true);
  });
});

describe('part counting', () => {
  it('counts the parts of a four-bar leg by kind', () => {
    expect(partCounts(basicLeg())).toEqual({ link: 3, pin: 4, fixed: 2, crank: 1 });
    expect(partCounts(createEmptyDesign())).toEqual({ link: 0, pin: 0, fixed: 0, crank: 0 });
    expect(usedParts(basicLeg())).toEqual(['link', 'pin', 'fixed', 'crank']);
  });
});
