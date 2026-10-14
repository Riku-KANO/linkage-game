import { describe, expect, it } from 'vitest';
import { compileMechanism, type CompiledMechanism } from './compile';
import { poseDerivative, solvePose } from './solve';
import { mirrorDesignX } from './legs';
import { chebyshevLambda, fourBar, jansenLeg } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';

/** θ = 0 から theta まで細かく回して、組立モードを連続に保った姿勢を得る */
function poseAt(m: CompiledMechanism, theta: number): Float64Array {
  let prev: Float64Array | null = null;
  const n = Math.max(1, Math.ceil(Math.abs(theta) / 0.02));
  for (let s = 1; s <= n; s++) {
    prev = solvePose(m, (theta * s) / n, { prev }).positions;
  }
  return prev ?? solvePose(m, 0).positions;
}

/** 中心差分 (p(θ+h) − p(θ−h)) / 2h。前後の解は pos を prev にして同じ組立モードをとる */
function numericDerivative(m: CompiledMechanism, theta: number, pos: Float64Array, h: number) {
  const a = solvePose(m, theta + h, { prev: pos }).positions;
  const b = solvePose(m, theta - h, { prev: pos }).positions;
  return a.map((v, i) => (v - b[i]!) / (2 * h));
}

function expectClose(
  m: CompiledMechanism,
  theta: number,
  h: number,
  rel: number,
  joints: number[] = m.jointIds.map((_, i) => i),
) {
  const pos = poseAt(m, theta);
  const d = poseDerivative(m, theta, pos);
  const num = numericDerivative(m, theta, pos, h);
  for (const j of joints) {
    const ax = d[j * 2]!;
    const ay = d[j * 2 + 1]!;
    const nx = num[j * 2]!;
    const ny = num[j * 2 + 1]!;
    const err = Math.hypot(ax - nx, ay - ny);
    const scale = Math.max(Math.hypot(nx, ny), 1e-3);
    expect(err / scale, `${m.design.name} θ=${theta} joint ${m.jointIds[j]}`).toBeLessThan(rel);
  }
}

describe('poseDerivative (S-04)', () => {
  it('gives r·(−sin, cos) for the crank pin of a four-bar', () => {
    const m = compileMechanism(fourBar());
    const A = m.jointIndex.get('A')!;
    const r = 10;
    for (const th of [0, 0.7, 2, 3.5, 5.9]) {
      const pos = poseAt(m, th);
      const d = poseDerivative(m, th, pos);
      const phi = Math.PI / 2 + th; // 設計姿勢でクランクは +y を向く
      expect(d[A * 2]).toBeCloseTo(-r * Math.sin(phi), 10);
      expect(d[A * 2 + 1]).toBeCloseTo(r * Math.cos(phi), 10);
      // 固定点は動かない
      for (const id of ['O2', 'O4']) {
        const k = m.jointIndex.get(id)!;
        expect(d[k * 2]).toBe(0);
        expect(d[k * 2 + 1]).toBe(0);
      }
    }
  });

  it('matches a fine numeric difference on the Jansen foot within 1e-4', () => {
    const m = compileMechanism(jansenLeg());
    for (let k = 0; k < 24; k++) {
      expectClose(m, (k * 2 * Math.PI) / 24, 1e-6, 1e-4, [m.footIndex]);
    }
  });

  it('matches numeric differences for every joint of the presets', () => {
    for (const d of [jansenLeg(), mirrorDesignX(jansenLeg()), chebyshevLambda(), fourBar()]) {
      const m = compileMechanism(d);
      for (const th of [0.3, 1.9, 4.4]) expectClose(m, th, 1e-6, 1e-4);
    }
  });

  it('handles Newton-solved (non-dyadic) groups', () => {
    const d: DesignDoc = {
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
      legs: { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false },
    };
    const m = compileMechanism(d);
    expect(m.plan.some((s) => s.kind === 'newton')).toBe(true);
    // このトライアドは約 30° で動かなくなるので、その手前で比べる
    for (const th of [0.05, 0.15, 0.25]) {
      // 微分した距離拘束 (p_i − p_j)·(v_i − v_j) = 0 を厳密に満たす
      const pos = poseAt(m, th);
      const v = poseDerivative(m, th, pos);
      m.links.forEach((ls) => {
        for (let a = 0; a < ls.length; a++)
          for (let b = a + 1; b < ls.length; b++) {
            const i = ls[a]!;
            const j = ls[b]!;
            const dot =
              (pos[i * 2]! - pos[j * 2]!) * (v[i * 2]! - v[j * 2]!) +
              (pos[i * 2 + 1]! - pos[j * 2 + 1]!) * (v[i * 2 + 1]! - v[j * 2 + 1]!);
            expect(Math.abs(dot)).toBeLessThan(1e-8);
          }
      });
      // ニュートン法の収束誤差(1e-7 cm)があるので、数値微分とは粗く比べる
      expectClose(m, th, 1e-3, 5e-3);
    }
  });

  it('writes into the given output buffer', () => {
    const m = compileMechanism(jansenLeg());
    const pos = poseAt(m, 1);
    const out = new Float64Array(m.jointIds.length * 2).fill(123);
    const d = poseDerivative(m, 1, pos, { out });
    expect(d).toBe(out);
    expect(d[0]).not.toBe(123);
  });

  it('stays finite at an exact dead point', () => {
    // 全点が一直線に並ぶ姿勢で描いた変位点の四節
    const d: DesignDoc = {
      ...fourBar(),
      joints: [
        { id: 'O2', x: 0, y: 0, fixed: true },
        { id: 'O4', x: 40, y: 0, fixed: true },
        { id: 'A', x: 10, y: 0, fixed: false },
        { id: 'B', x: 50, y: 0, fixed: false },
        { id: 'F', x: 30, y: -10, fixed: false },
      ],
    };
    const m = compileMechanism(d);
    const v = poseDerivative(m, 0, solvePose(m, 0).positions);
    expect(v.every((x) => Number.isFinite(x))).toBe(true);
  });
});
