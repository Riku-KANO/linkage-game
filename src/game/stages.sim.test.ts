import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeBill } from '@/core/model/parts';
import type { DesignDoc } from '@/core/model/types';
import { createRapierTerrain } from '@/core/sim/terrain';
import type { TerrainCollider } from '@/core/sim/types';
import { jansenMachine, STANDARD_LEGS, withLegs } from './designs';
import { diagnoseFailure } from './diagnose';
import { evaluateRun } from './evaluate';
import { preflight } from './preflight';
import { runStage } from './run';
import { getStage, startDesign, STAGES } from './stages';
import type { StageDef } from './types';

/**
 * 受け入れテスト(TUNE-1・TUNE-2):本物の sim(Rapier の地形判定)でステージを試走する。
 * - TUNE-1:参考解は全ステージでクリアできる(スタート位置をずらしても)
 * - TUNE-2:最初の設計は意図どおりに失敗する(試走前チェックで止まる / 段差でつまずく / 倒れる / 詰まる /
 *   予算オーバー)
 * Rapier の初期化と地形の生成はステージごとに 1 回だけ。
 */

const terrains = new Map<string, TerrainCollider>();
beforeAll(async () => {
  for (const s of STAGES) terrains.set(s.id, await createRapierTerrain(s.terrain));
});
afterAll(() => {
  for (const t of terrains.values()) t.dispose?.();
});

const stage = (id: string): StageDef => getStage(id)!;
const run = (s: StageDef, d: DesignDoc, shiftX = 0) =>
  runStage(s, d, terrains.get(s.id)!, { shiftX });
const errorCodes = (s: StageDef, d: DesignDoc) =>
  preflight(s, d)
    .problems.filter((p) => p.severity === 'error')
    .map((p) => p.code);

/**
 * 頑健さを見るスタート位置のずらし(m)。脚の位相と障害物の位置の組み合わせを変える。
 * 参考解は 1 つを除いてクリアできること(段差・溝で 2〜3% ほど止まる位相がある:TUNE-1 の実測)
 */
const SHIFTS = [-0.1, -0.2, -0.3, -0.4, -0.5, -0.6];
const ROBUST_MIN = SHIFTS.length - 1;

describe('TUNE-1: every reference clears its stage in the real simulator', () => {
  it.each(STAGES.map((s) => [s.id, s] as const))('%s', (_id, s) => {
    const ref = s.reference!;
    expect(preflight(s, ref).ok).toBe(true);
    const { summary, result } = run(s, ref);
    const r = evaluateRun(s, ref, summary);
    expect(r.reason).toBeNull();
    expect(r.cleared).toBe(true);
    // 余裕をもってクリアする:制限時間の半分以内、傾きは転倒(60°)よりずっと小さい
    expect(r.time).toBeLessThan(s.timeLimit / 2);
    expect((result.maxTilt * 180) / Math.PI).toBeLessThan(40);
  });

  it.each(STAGES.filter((s) => s.terrain.shapes.length > 0).map((s) => [s.id, s] as const))(
    '%s also clears from shifted starts (not a lucky phase)',
    (_id, s) => {
      const failed = SHIFTS.filter((shift) => {
        const { summary } = run(s, s.reference!, shift);
        return !evaluateRun(s, s.reference!, summary).cleared;
      });
      expect(
        SHIFTS.length - failed.length,
        `failed at ${failed.join(', ')}`,
      ).toBeGreaterThanOrEqual(ROBUST_MIN);
    },
  );

  it('chapter 1 uses the two-sided standard layout', () => {
    for (const s of STAGES.filter((q) => q.chapter === 1)) {
      expect(s.reference!.legs).toEqual(STANDARD_LEGS);
      expect(startDesign(s).legs).toEqual(STANDARD_LEGS);
    }
  });
});

describe('TUNE-2: starting designs fail for the intended reason', () => {
  it('c1-s1: the machine missing a link (DOF 2) is stopped by the preflight check', () => {
    const s = stage('c1-s1');
    expect(errorCodes(s, startDesign(s))).toEqual(['dofLoose']);
  });

  it('c1-s2: the crank that cannot turn is stopped by the preflight check and jams in the sim', () => {
    const s = stage('c1-s2');
    const d = startDesign(s);
    expect(errorCodes(s, d)).toEqual(['noFullRotation']);
    const { summary } = run(s, d);
    expect(summary.jammed).toBe(true);
    expect(evaluateRun(s, d, summary).reason).toBe('jammed');
  });

  it('stages without a given machine start from an empty design', () => {
    for (const id of ['c1-s3', 'c1-s4', 'c1-s5', 'c2-s4', 'c2-s5']) {
      const s = stage(id);
      expect(s.initialDesign, id).toBeUndefined();
      expect(errorCodes(s, startDesign(s)), id).toEqual(['empty']);
    }
  });

  it('c2-s1: the shuffling leg stumbles at the step; the high-stepping reference climbs it', () => {
    const s = stage('c2-s1');
    const d = startDesign(s);
    expect(preflight(s, d).ok).toBe(true);
    for (const shift of [0, ...SHIFTS]) {
      const { summary } = run(s, d, shift);
      expect(summary.reachedGoal, `shift ${shift}`).toBe(false);
      expect(summary.fallen, `shift ${shift}`).toBe(false);
      // 段差(x = 1.2m)を越えきれずに止まっている
      expect(s.start.x + shift + summary.distance, `shift ${shift}`).toBeLessThan(2);
      expect(evaluateRun(s, d, summary).reason, `shift ${shift}`).toBe('stalled');
      expect(diagnoseFailure(s, d, summary)?.cause, `shift ${shift}`).toBe('stumbled');
    }
    const ref = run(s, s.reference!);
    expect(evaluateRun(s, s.reference!, ref.summary).cleared).toBe(true);
  });

  it('c2-s2: the single leg falls over (top heavy), and so does a one-sided leg array', () => {
    const s = stage('c2-s2');
    const d = startDesign(s);
    expect(preflight(s, d).ok).toBe(true);
    const { summary } = run(s, d);
    expect(summary.fallen).toBe(true);
    expect(evaluateRun(s, d, summary).reason).toBe('fallen');
    expect(diagnoseFailure(s, d, summary)?.cause).toBe('topHeavy');
    // 片側だけに 3 組並べた脚列(以前の標準)も、接地する脚先が一直線に並んで横に倒れる
    const oneSided = withLegs(d, { count: 3, phaseStepDeg: 120, spacing: 22, mirrorX: true });
    expect(run(s, oneSided).summary.fallen).toBe(true);
  });

  it('c2-s3: the braced machine (DOF 0) is stopped by the preflight check and jams in the sim', () => {
    const s = stage('c2-s3');
    const d = startDesign(s);
    expect(errorCodes(s, d)).toEqual(['dofLocked']);
    const { summary } = run(s, d);
    expect(summary.reachedGoal).toBe(false);
    expect(summary.jammed).toBe(true);
    expect(Math.abs(summary.distance)).toBeLessThan(0.05);
  });

  it('budget stages reject machines over the budget', () => {
    // c2-s4:参考解(ヤンセン 12 脚)に脚の組を足すと予算を超える
    const s4 = stage('c2-s4');
    const bigger = withLegs(s4.reference!, { ...s4.reference!.legs, count: 8 });
    expect(computeBill(bigger).cost).toBeGreaterThan(s4.budget!);
    expect(errorCodes(s4, bigger)).toEqual(['overBudget']);
    // c2-s5:ヤンセン機(12 脚)は予算に収まらない。試走で止まらなくても予算オーバーで失敗
    const s5 = stage('c2-s5');
    const jansen = jansenMachine();
    expect(errorCodes(s5, jansen)).toEqual(['overBudget']);
    const { summary } = run(s5, jansen);
    expect(evaluateRun(s5, jansen, summary).reason).toBe('overBudget');
    expect(diagnoseFailure(s5, jansen, summary)?.cause).toBe('overBudget');
  });
});
