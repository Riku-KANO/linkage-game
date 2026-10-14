import { describe, expect, it } from 'vitest';
import { compileLegSet, solveLegInstances } from './legs';
import { analyzeMechanism } from './analyze';
import { compileMechanism } from './compile';
import { poseDerivative, sampleCycle, solvePose } from './solve';
import { jansenLeg } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';

/**
 * 非機能要件:複製後 100 ジョイントで運動学ソルバー 4ms/フレーム以内、
 * analyzeMechanism(180 サンプル)は編集のたびに呼ばれるので 10ms 以内。
 * CI でも安定するよう、暖機してから平均をとり、閾値は目標そのまま(実測はその数十分の一)。
 */

function bench(frames: number, warmup: number, fn: (i: number) => void): number {
  for (let i = 0; i < warmup; i++) fn(i);
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) fn(i);
  return (performance.now() - t0) / frames;
}

/** ヤンセン脚 6 組 × 前後反転 = 12 脚、96 ジョイント */
function jansenMachine(): DesignDoc {
  return jansenLeg(undefined, { count: 6, phaseStepDeg: 60, spacing: 20, mirrorX: true });
}

/**
 * ニュートン法で解くトライアド(7 ジョイント)を 14 脚 = 98 ジョイント。
 * 約 30° しか動かない機構なので、反転脚(クランク位相が π ずれる)は使わない
 */
function triadMachine(): DesignDoc {
  return {
    version: 1,
    name: 'triad',
    joints: [
      { id: 'O', x: 0, y: 0, fixed: true },
      { id: 'K1', x: 5, y: 0, fixed: false },
      { id: 'K2', x: 60, y: 0, fixed: true },
      { id: 'K3', x: 30, y: 50, fixed: true },
      { id: 'T1', x: 20, y: 10, fixed: false },
      { id: 'T2', x: 40, y: 12, fixed: false },
      { id: 'T3', x: 30, y: 28, fixed: false },
    ],
    links: [
      { id: 'crank', joints: ['O', 'K1'] },
      { id: 'b1', joints: ['K1', 'T1'] },
      { id: 'b2', joints: ['K2', 'T2'] },
      { id: 'b3', joints: ['K3', 'T3'] },
      { id: 'tri', joints: ['T1', 'T2', 'T3'] },
    ],
    cranks: [{ id: 'm', link: 'crank', pivot: 'O', phase: 0 }],
    foot: 'T3',
    motor: { rpm: 30 },
    legs: { count: 14, phaseStepDeg: 0, spacing: 20, mirrorX: false },
  };
}

describe('performance (non-functional)', () => {
  it('solves a ~100-joint Jansen machine (with dp/dθ) in < 4 ms per frame', () => {
    const set = compileLegSet(jansenMachine());
    const joints = set.instances.length * set.normal.jointIds.length;
    expect(joints).toBeGreaterThanOrEqual(96);
    const dt = (2 * Math.PI) / 240; // 30 rpm 前後で 1 フレームあたりの角度
    const ms = bench(600, 60, (i) => {
      // 1 描画フレーム = 物理 4 サブステップ
      for (let sub = 0; sub < 4; sub++) {
        solveLegInstances(set, (i * 4 + sub) * dt * 0.25, { derivatives: true });
      }
    });
    expect(set.ok.every(Boolean)).toBe(true);
    expect(ms).toBeLessThan(4);
  });

  it('solves a ~100-joint Newton-heavy machine in < 4 ms per frame', () => {
    const set = compileLegSet(triadMachine());
    expect(set.instances.length * set.normal.jointIds.length).toBeGreaterThanOrEqual(98);
    // このトライアドは約 30° しか動かないので、その範囲で往復させる
    const ms = bench(300, 30, (i) => {
      const th = 0.25 * Math.sin(i * 0.05);
      for (let sub = 0; sub < 4; sub++) solveLegInstances(set, th + sub * 0.001);
    });
    expect(set.ok.every(Boolean)).toBe(true);
    expect(ms).toBeLessThan(4);
  });

  it('analyzes the Jansen leg (180 samples) in < 10 ms', () => {
    const d = jansenLeg();
    const ms = bench(50, 10, () => analyzeMechanism(d, { steps: 180 }));
    expect(ms).toBeLessThan(10);
  });

  it('keeps solvePose results identical when reusing buffers', () => {
    const m = compileMechanism(jansenLeg());
    const cyc = sampleCycle(m, 90);
    const out = new Float64Array(m.jointIds.length * 2);
    let prev: Float64Array | null = null;
    const back = new Float64Array(out.length);
    cyc.thetas.forEach((th, s) => {
      const res = solvePose(m, th, { prev, out });
      expect(Array.from(res.positions)).toEqual(Array.from(cyc.positions[s]!));
      back.set(res.positions);
      prev = back;
    });
    // poseDerivative の出力バッファも再利用できる
    const v = new Float64Array(out.length);
    expect(poseDerivative(m, 0, cyc.positions[0]!, { out: v })).toBe(v);
  });
});
