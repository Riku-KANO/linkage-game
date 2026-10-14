import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DesignDoc } from '@/core/model/types';
import { createRapierTerrain } from '@/core/sim/terrain';
import type { TerrainCollider } from '@/core/sim/types';
import { STANDARD_LEGS } from './designs';
import { evaluateRun } from './evaluate';
import { preflight } from './preflight';
import { runStage } from './run';
import { startDesign, STAGES } from './stages';
import type { StageDef } from './types';

/**
 * 受け入れテスト(TUNE-1):本物の sim(Rapier の地形判定)でステージを試走する。
 * 参考解は全ステージでクリアできる(スタート位置をずらしても)
 * Rapier の初期化と地形の生成はステージごとに 1 回だけ。
 */

const terrains = new Map<string, TerrainCollider>();
beforeAll(async () => {
  for (const s of STAGES) terrains.set(s.id, await createRapierTerrain(s.terrain));
});
afterAll(() => {
  for (const t of terrains.values()) t.dispose?.();
});

const run = (s: StageDef, d: DesignDoc, shiftX = 0) =>
  runStage(s, d, terrains.get(s.id)!, { shiftX });

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
