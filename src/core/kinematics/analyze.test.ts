import { describe, expect, it } from 'vitest';
import { analyzeMechanism } from './analyze';
import { compileMechanism } from './compile';
import { sampleCycle, solvePose } from './solve';
import { makeFourBar, withParts } from './testing';
import { chebyshevLambda, dyadPoint, fourBar, jansenLeg } from '@/core/model/presets';
import { hasKey } from '@/i18n';
import type { MechanismAnalysis } from './analyze';

const TAU = 2 * Math.PI;
/** 角度差(rad)を -π..π に */
const angleDiff = (a: number, b: number) => {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return d > Math.PI ? d - TAU : d;
};

function expectTranslated(a: MechanismAnalysis) {
  for (const m of a.messages) expect(hasKey(m.key), m.key).toBe(true);
}

describe('analyzeMechanism: healthy presets', () => {
  it('reports no problems for Jansen, Chebyshev and the default four-bar', () => {
    for (const d of [jansenLeg(), chebyshevLambda(), fourBar()]) {
      const a = analyzeMechanism(d);
      expect(a.assemblable, d.name).toBe(true);
      expect(a.fullRotation, d.name).toBe(true);
      expect(a.failAngles, d.name).toEqual([]);
      expect(a.deadPoints, d.name).toEqual([]);
      expect(a.problemLinks, d.name).toEqual([]);
      expect(a.problemJoints, d.name).toEqual([]);
      expect(
        a.messages.filter((m) => m.severity !== 'info'),
        d.name,
      ).toEqual([]);
      expectTranslated(a);
    }
  });
});

describe('analyzeMechanism: assembly failures (E-05)', () => {
  it('marks the coupler and rocker of a four-bar whose crank is too long', () => {
    const a = analyzeMechanism(fourBar(28, 35, 30, 40));
    expect(a.assemblable).toBe(true);
    expect(a.fullRotation).toBe(false);
    expect(a.failAngles.length).toBeGreaterThan(0);
    expect(a.problemLinks).toContain('coupler');
    expect(a.problemLinks).toContain('rocker');
    expect(a.problemLinks).not.toContain('crank');
    // B は届かない点そのもの。F は B に引きずられているだけなので原因には含めない
    expect(a.problemJoints).toContain('B');
    expect(a.problemJoints).not.toContain('F');
    const msg = a.messages.find((m) => m.key === 'analysis.noFullRotation');
    expect(msg?.severity).toBe('error');
    expect(msg?.params).toMatchObject({ from: expect.any(Number), to: expect.any(Number) });
    expectTranslated(a);
  });

  it('does not blame links downstream of the failing joint', () => {
    const base = makeFourBar({ ground: 40, crank: 28, coupler: 35, rocker: 30 });
    const B = base.joints.find((j) => j.id === 'B')!;
    // X は B と O4 から 2 本の棒で決まる(|B - O4| は出力節の長さで一定なので、B が解ければ必ず解ける)
    const X = dyadPoint(B, 25, { x: 40, y: 0 }, 20, 'up');
    const d = withParts(base, {
      joints: [{ id: 'X', x: X.x, y: X.y, fixed: false }],
      links: [
        { id: 'bx', joints: ['B', 'X'] },
        { id: 'qx', joints: ['O4', 'X'] },
      ],
    });
    const a = analyzeMechanism(d);
    expect(a.fullRotation).toBe(false);
    expect(a.problemLinks.sort()).toEqual(['coupler', 'rocker']);
    expect(a.problemJoints).toEqual(['B']);
  });

  it('reports each failing angle range once in the cycle summary', () => {
    const m = compileMechanism(fourBar(28, 35, 30, 40));
    const cyc = sampleCycle(m, 90);
    expect(cyc.failedLinks?.map((i) => m.linkIds[i]).sort()).toEqual(['coupler', 'rocker']);
    expect(cyc.causeJoints?.map((i) => m.jointIds[i])).toEqual(['B']);
    expect(cyc.slack).toHaveLength(90);
  });

  it('detects a braced (locked) four-bar instead of silently moving it', () => {
    const base = fourBar();
    const locked = withParts(base, { links: [{ id: 'brace', joints: ['O2', 'B'] }] });
    const m = compileMechanism(locked);
    expect(solvePose(m, 0).ok).toBe(true);
    const res = solvePose(m, 0.2);
    expect(res.ok).toBe(false);
    expect(res.failedLinks.map((i) => m.linkIds[i])).toContain('brace');
    const a = analyzeMechanism(locked);
    expect(a.fullRotation).toBe(false);
    expect(a.problemLinks).toContain('brace');
  });
});

describe('analyzeMechanism: dead points (E-05)', () => {
  it('finds the dead points of a change-point (parallelogram) four-bar', () => {
    // 地節 40・クランク 10・中間節 40・出力節 10。クランクが地節と一直線(θ = ±90°)で全点が一直線に並ぶ
    const a = analyzeMechanism(makeFourBar({ ground: 40, crank: 10, coupler: 40, rocker: 10 }));
    expect(a.grashof[0]!.type).toBe('change-point');
    expect(a.deadPoints.length).toBeGreaterThanOrEqual(1);
    for (const dp of a.deadPoints) {
      const near = Math.min(
        Math.abs(angleDiff(dp.theta, Math.PI / 2)),
        Math.abs(angleDiff(dp.theta, -Math.PI / 2)),
      );
      expect(near).toBeLessThan((3 * Math.PI) / 180);
      expect(dp.joint).toBe('B');
      expect(dp.links?.slice().sort()).toEqual(['coupler', 'rocker']);
      expect(dp.slack).toBeLessThan(0.05);
      expect(dp.thetaStart).toBeDefined();
      expect(dp.thetaEnd).toBeDefined();
    }
    expect(a.messages.map((m) => m.key)).toContain('analysis.deadPoint');
    expect(a.problemJoints).toContain('B');
    expectTranslated(a);
  });

  it('flags a nearly singular crank-rocker that still turns fully', () => {
    // s + l = 50 < p + q = 50.005:かろうじてグラスホフ。θ = ±90° で中間節と出力節がほぼ一直線になる
    const d = makeFourBar({ ground: 40, crank: 10, coupler: 40, rocker: 10.005 });
    const a = analyzeMechanism(d);
    expect(a.fullRotation).toBe(true);
    expect(a.grashof[0]!.type).toBe('crank-rocker');
    expect(a.deadPoints.length).toBeGreaterThanOrEqual(1);
    const worst = Math.min(...a.deadPoints.map((p) => p.slack));
    expect(worst).toBeGreaterThan(0);
    // 特異姿勢はクランクが地節と一直線になる付近(θ ≈ ±90°)
    for (const dp of a.deadPoints) {
      const near = Math.min(
        Math.abs(angleDiff(dp.theta, Math.PI / 2)),
        Math.abs(angleDiff(dp.theta, -Math.PI / 2)),
      );
      expect(near).toBeLessThan((6 * Math.PI) / 180);
    }
    // 閾値を下げれば死点ではなくなる
    expect(analyzeMechanism(d, { deadPointSlack: 1e-3 }).deadPoints).toEqual([]);
  });
});
