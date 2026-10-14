import { beforeAll, describe, expect, it } from 'vitest';
import { createRapierTerrain } from '@/core/sim/terrain';
import {
  CALIBRATION,
  calibrationDrift,
  deriveStageNumbers,
  formatCalibrationRow,
  measureReference,
  niceCeil,
  type CalibratedNumbers,
  type ReferenceMeasurement,
} from './calibrate';
import { medalFor } from './evaluate';
import { getStage, STAGES } from './stages';

/**
 * TUNE-3 校正。`pnpm calibrate` はこのファイルをログ付きで実行し、参考解の実測と校正値の表を出す。
 * ステージデータ(stages.ts)が校正値から外れたら失敗する(sim の変更で参考解の速さが変わったときなど)。
 */

const fake = (patch: Partial<ReferenceMeasurement> = {}): ReferenceMeasurement => ({
  stageId: 'c2-s5',
  reachedGoal: true,
  fallen: false,
  stalled: false,
  jammed: false,
  time: 4.2,
  energy: 400,
  maxTilt: 0.1,
  parts: 10,
  cost: 1481.7,
  ...patch,
});

describe('nice rounding', () => {
  it('rounds up to 2-3 significant steps', () => {
    expect(niceCeil(1.88)).toBe(1.9);
    expect(niceCeil(1.9)).toBe(1.9);
    expect(niceCeil(2.42)).toBe(2.5);
    expect(niceCeil(5.01)).toBe(5.2);
    expect(niceCeil(59.4)).toBe(60);
    expect(niceCeil(119)).toBe(120);
    expect(niceCeil(1243.5)).toBe(1250);
    expect(niceCeil(1852)).toBe(1900);
    expect(niceCeil(0)).toBe(0);
  });

  it('never rounds down', () => {
    for (let v = 0.37; v < 5000; v *= 1.37) {
      const n = niceCeil(v);
      expect(n).toBeGreaterThanOrEqual(v);
      expect(n).toBeLessThanOrEqual(v * 1.06);
    }
  });
});

describe('deriveStageNumbers', () => {
  const budgetStage = getStage('c2-s5')!;
  const freeStage = getStage('c1-s3')!;

  it('scales the reference into ordered medal thresholds the reference itself reaches', () => {
    const m = fake();
    const d = deriveStageNumbers(freeStage, m);
    for (const axis of ['time', 'parts', 'cost', 'energy'] as const) {
      const [g, s, b] = d.medals[axis];
      expect(g).toBeLessThanOrEqual(s);
      expect(s).toBeLessThanOrEqual(b);
    }
    expect(medalFor(m.time, d.medals.time)).toBe('gold');
    expect(medalFor(m.energy, d.medals.energy)).toBe('gold');
    expect(medalFor(m.parts, d.medals.parts)).toBe('gold');
    expect(medalFor(m.cost, d.medals.cost)).toBe('gold');
    expect(d.medals.parts).toEqual([10, 12, 15]);
    expect(d.budget).toBeNull();
  });

  it('gives a generous time limit (>= 1.5 x bronze, in 5 s steps)', () => {
    for (const time of [1.8, 4.2, 7.3, 20]) {
      const d = deriveStageNumbers(freeStage, fake({ time }));
      expect(d.timeLimit).toBeGreaterThanOrEqual(d.medals.time[2] * 1.5);
      expect(d.timeLimit).toBeGreaterThanOrEqual(time * CALIBRATION.timeLimit.perReference);
      expect(d.timeLimit).toBeGreaterThanOrEqual(CALIBRATION.timeLimit.min);
      expect(d.timeLimit % CALIBRATION.timeLimit.step).toBe(0);
    }
  });

  it('sets a budget above the reference cost and caps the cost medals at it', () => {
    const m = fake();
    const d = deriveStageNumbers(budgetStage, m);
    expect(d.budget).toBe(1900);
    expect(d.budget!).toBeGreaterThan(m.cost);
    expect(Math.max(...d.medals.cost)).toBeLessThanOrEqual(d.budget!);
  });

  it('reports drift only beyond the tolerance (exact for parts, cost and budget)', () => {
    const d = deriveStageNumbers(budgetStage, fake());
    const same = { ...budgetStage, timeLimit: d.timeLimit, budget: d.budget, medals: d.medals };
    expect(calibrationDrift(same, d)).toEqual([]);
    const near: CalibratedNumbers = structuredClone(d);
    near.medals.time = near.medals.time.map((v) => v * 1.1) as typeof near.medals.time;
    expect(calibrationDrift(same, near)).toEqual([]);
    const far: CalibratedNumbers = structuredClone(d);
    far.medals.energy[0] = d.medals.energy[0] * 1.5;
    far.medals.cost[2] = d.medals.cost[2] + 1;
    expect(calibrationDrift(same, far).map((x) => x.field)).toEqual([
      'medals.cost[2]',
      'medals.energy[0]',
    ]);
  });
});

describe('stage data matches the calibration (TUNE-3)', () => {
  const rows = new Map<string, { m: ReferenceMeasurement; d: CalibratedNumbers }>();

  beforeAll(async () => {
    const lines: string[] = [];
    for (const stage of STAGES) {
      const terrain = await createRapierTerrain(stage.terrain);
      const m = measureReference(stage, terrain);
      terrain.dispose?.();
      const d = deriveStageNumbers(stage, m);
      rows.set(stage.id, { m, d });
      lines.push(formatCalibrationRow(stage, m, d));
      for (const x of calibrationDrift(stage, d)) {
        lines.push(`    ずれ ${x.field}: ステージ ${x.actual} / 校正 ${x.expected}`);
      }
    }
    // `pnpm calibrate` で表示する(通常のテストでは出力を抑える)
    console.log(`\n校正(参考解の実測 → ステージの数値)\n${lines.join('\n')}\n`);
  });

  it.each(STAGES.map((s) => [s.id, s] as const))('%s', (id, stage) => {
    const { m, d } = rows.get(id)!;
    expect(m.reachedGoal, 'reference reaches the goal').toBe(true);
    expect(calibrationDrift(stage, d)).toEqual([]);
    // 参考解は時間で金か銀(時間がずれ始めたら、上の許容を超える前にここで気づける)
    expect(medalFor(m.time, stage.medals.time)).toMatch(/gold|silver/);
    expect(m.time * CALIBRATION.timeLimit.perReference).toBeLessThanOrEqual(stage.timeLimit * 1.2);
  });
});
