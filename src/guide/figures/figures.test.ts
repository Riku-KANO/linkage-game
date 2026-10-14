import { describe, expect, it } from 'vitest';
import { compileMechanism, solvePose, walkDirection } from '@/core/kinematics';
import { FIGURE_DESIGNS } from './designs';
import {
  boundsOf,
  cycleFigure,
  fitMap,
  fiveBarSway,
  jointPath,
  legSample,
  poseAt,
  walkerTrack,
} from './motion';

const dist = (p: Float64Array, i: number, j: number) =>
  Math.hypot(p[i * 2]! - p[j * 2]!, p[i * 2 + 1]! - p[j * 2 + 1]!);

describe('図の機構(本物のソルバーで解く)', () => {
  it('四節リンク:自由度 1 で一回転できる', () => {
    const { analysis } = cycleFigure('loopFourBar');
    expect(analysis.dof).toBe(1);
    expect(analysis.dofStatus).toBe('ok');
    expect(analysis.fullRotation).toBe(true);
  });

  it('三角形:自由度 0 で固まり、クランクを少しでも回すと組み立てられない', () => {
    const { analysis, mech } = cycleFigure('loopTriangle');
    expect(analysis.dof).toBe(0);
    expect(analysis.dofStatus).toBe('locked');
    expect(analysis.fullRotation).toBe(false);
    expect(analysis.problemLinks.length).toBeGreaterThan(0);
    expect(solvePose(mech, 0.1).ok).toBe(false);
  });

  it('五節リンク:自由度 2 でぐらつく(クランクを止めても B・C が動ける)', () => {
    const { analysis } = cycleFigure('loopFiveBar');
    expect(analysis.dof).toBe(2);
    expect(analysis.dofStatus).toBe('loose');
    expect(analysis.looseJoints).toEqual(expect.arrayContaining(['B', 'C']));
  });

  it('五節リンクのぐらつきの姿勢は、どれも五節リンクの棒の長さを守り、クランクは止まったまま', () => {
    const design = FIGURE_DESIGNS.loopFiveBar();
    const mech = compileMechanism(design);
    const idx = (id: string) => mech.jointIndex.get(id)!;
    const poses = fiveBarSway();
    const ref = mech.designPos;
    const pairs: [string, string][] = [
      ['O1', 'A'],
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'O2'],
    ];
    let maxMove = 0;
    for (const p of poses) {
      for (const [a, b] of pairs) {
        expect(dist(p, idx(a), idx(b))).toBeCloseTo(dist(ref, idx(a), idx(b)), 6);
      }
      expect(p[idx('A') * 2]).toBeCloseTo(ref[idx('A') * 2]!, 9);
      expect(p[idx('A') * 2 + 1]).toBeCloseTo(ref[idx('A') * 2 + 1]!, 9);
      maxMove = Math.max(
        maxMove,
        Math.hypot(
          p[idx('B') * 2]! - ref[idx('B') * 2]!,
          p[idx('B') * 2 + 1]! - ref[idx('B') * 2 + 1]!,
        ),
      );
    }
    expect(maxMove).toBeGreaterThan(5);
  });

  it('歩く脚の見本(第 1 章の基本の脚):底が平らで、歩幅と足上げがあり、前へ歩く', () => {
    const { analysis, design } = cycleFigure('goodLeg');
    expect(analysis.fullRotation).toBe(true);
    const f = analysis.foot!;
    expect(f.flatness).toBeLessThan(0.6);
    expect(f.stride).toBeGreaterThan(10);
    expect(f.lift).toBeGreaterThan(10);
    expect(walkDirection(f, design.motor.rpm)).toBe(1);
  });

  it('ヤンセン:前へ歩く', () => {
    const { analysis, design } = cycleFigure('jansen');
    expect(walkDirection(analysis.foot!, design.motor.rpm)).toBe(1);
  });

  it('長すぎるクランク:組み立てられるが一回転できない(届かない角度がある)', () => {
    const { analysis } = cycleFigure('tooLongCrank');
    expect(analysis.assemblable).toBe(true);
    expect(analysis.fullRotation).toBe(false);
    expect(analysis.failRanges!.length).toBeGreaterThan(0);
    expect(analysis.problemLinks.length).toBeGreaterThan(0);
  });

  it('死点の見本:一回転でき、死点がある', () => {
    const { analysis } = cycleFigure('deadPointBar');
    expect(analysis.fullRotation).toBe(true);
    expect(analysis.deadPoints.length).toBeGreaterThan(0);
    expect(analysis.deadPoints[0]!.links?.length).toBe(2);
  });

  it('カップラー上の 3 点は、それぞれちがう軌道をえがく', () => {
    const { analysis, mech, cycle } = cycleFigure('couplerPoints');
    expect(analysis.dof).toBe(1);
    expect(analysis.fullRotation).toBe(true);
    const spans = ['P1', 'P2', 'P3'].map((id) => {
      const b = boundsOf([jointPath(cycle, mech.jointIndex.get(id)!)]);
      return [b.maxX - b.minX, b.maxY - b.minY];
    });
    expect(new Set(spans.map((s) => s.map((v) => v.toFixed(0)).join())).size).toBe(3);
  });

  it('二重平行四辺形:式では自由度 0 だが、特殊な寸法で一回転できる', () => {
    const { analysis } = cycleFigure('doubleParallelogram');
    expect(analysis.dof).toBe(0);
    expect(analysis.specialGeometry).toBe(true);
    expect(analysis.fullRotation).toBe(true);
  });
});

describe('図の動きの補助', () => {
  it('poseAt:サンプルの上ではその姿勢、間は補間', () => {
    const { cycle } = cycleFigure('loopFourBar');
    const p0 = poseAt(cycle, 0);
    expect(Array.from(p0.positions)).toEqual(Array.from(cycle.positions[0]!));
    expect(poseAt(cycle, 1).index).toBe(0);
    const half = poseAt(cycle, 0.5 / cycle.steps);
    const a = cycle.positions[0]!;
    const b = cycle.positions[1]!;
    expect(half.positions[2]).toBeCloseTo((a[2]! + b[2]!) / 2, 9);
  });

  it('poseAt:組み立てられない角度では ok=false', () => {
    const { cycle } = cycleFigure('tooLongCrank');
    const bad = cycle.ok.findIndex((ok) => !ok);
    expect(poseAt(cycle, (bad + 0.1) / cycle.steps).ok).toBe(false);
  });

  it('walkerTrack:3 本の脚を 1/3 ずつずらすと、モーターの向きに回せば前へ進み、いちばん低い脚先が地面につく', () => {
    const { cycle, mech, design } = cycleFigure('goodLeg');
    const offsets = [0, 1 / 3, 2 / 3];
    const dir = Math.sign(design.motor.rpm) as 1 | -1;
    const tr = walkerTrack(cycle, mech.footIndex, offsets, dir);
    expect(tr.advance).toBeGreaterThan(25);
    // 逆に回すと後ろへ進む
    expect(walkerTrack(cycle, mech.footIndex, offsets, -dir as 1 | -1).advance).toBeLessThan(-25);
    for (let k = 0; k < cycle.steps; k++) {
      const low = Math.min(
        ...offsets.map(
          (o) => cycle.positions[legSample(cycle, dir * k, o)]![mech.footIndex * 2 + 1]!,
        ),
      );
      expect(low + tr.bodyY[k]!).toBeCloseTo(0, 9);
    }
    // 平らな底なので、機体はほとんど上下しない
    const ys = Array.from(tr.bodyY);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2);
  });

  it('fitMap:範囲を図に収め、y を下向きにする', () => {
    const m = fitMap({ minX: 0, maxX: 10, minY: 0, maxY: 5 }, 120, 80, 10);
    expect(m.scale).toBe(10);
    expect(m.x(0)).toBe(10);
    expect(m.x(10)).toBe(110);
    expect(m.y(5)).toBe(15);
    expect(m.y(0)).toBe(65);
  });
});
