import { describe, expect, it } from 'vitest';
import { analyzeConstraints } from './constraints';
import { nullSpace } from './linalg';
import { compileMechanism } from './compile';
import { analyzeMechanism, grublerDof } from './analyze';
import { makeFourBar, withParts } from './testing';
import { chebyshevLambda, dyadPoint, fourBar, jansenLeg } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';
import { hasKey } from '@/i18n';

/** solve.test.ts と同じ五節(四節の出力節を 2 本に分けた):自由度 2 */
function fiveBar(): DesignDoc {
  const base = fourBar();
  return {
    ...base,
    joints: [...base.joints, { id: 'X', x: 50, y: 30, fixed: false }],
    links: [
      base.links[0]!,
      { id: 'coupler', joints: ['A', 'B', 'F'] },
      { id: 'r1', joints: ['B', 'X'] },
      { id: 'r2', joints: ['X', 'O4'] },
    ],
  };
}

/** 四節に、固定点 O2 と B をつなぐ筋交いを足した(自由度 0) */
function bracedFourBar(): DesignDoc {
  return withParts(fourBar(), { links: [{ id: 'brace', joints: ['O2', 'B'] }] });
}

describe('nullSpace', () => {
  it('finds rank and null vectors of small matrices', () => {
    // rank 2 (third row = first + second)
    const A = new Float64Array([1, 0, 1, 0, 1, 1, 1, 1, 2]);
    const { rank, basis } = nullSpace(A, 3, 3);
    expect(rank).toBe(2);
    expect(basis).toHaveLength(1);
    const v = basis[0]!;
    for (let i = 0; i < 3; i++) {
      const r = A[i * 3]! * v[0]! + A[i * 3 + 1]! * v[1]! + A[i * 3 + 2]! * v[2]!;
      expect(Math.abs(r)).toBeLessThan(1e-12);
    }
    expect(Math.hypot(v[0]!, v[1]!, v[2]!)).toBeCloseTo(1, 12);
    // full column rank: empty null space
    expect(nullSpace(new Float64Array([1, 2, 3, 4, 5, 7]), 3, 2).basis).toHaveLength(0);
    // wide matrix: n - rank null vectors
    expect(nullSpace(new Float64Array([1, 2, 3]), 1, 3).basis).toHaveLength(2);
  });
});

describe('analyzeConstraints (E-04)', () => {
  it('finds neither redundancy nor looseness in proper mechanisms', () => {
    for (const d of [jansenLeg(), chebyshevLambda(), fourBar()]) {
      const c = analyzeConstraints(compileMechanism(d));
      expect(c.redundancy, d.name).toBe(0);
      expect(c.freedom, d.name).toBe(0);
      expect(c.redundantLinks, d.name).toEqual([]);
      expect(c.looseJoints, d.name).toEqual([]);
      expect(c.crankHeld, d.name).toBe(true);
    }
  });

  it('matches Grubler: freedom - redundancy = dof - cranks', () => {
    for (const d of [jansenLeg(), fourBar(), fiveBar(), bracedFourBar()]) {
      const c = analyzeConstraints(compileMechanism(d));
      expect(c.freedom - c.redundancy, d.name).toBe(grublerDof(d).dof - d.cranks.length);
    }
  });

  it('marks the braced region of a four-bar as redundant', () => {
    const c = analyzeConstraints(compileMechanism(bracedFourBar()));
    expect(c.redundancy).toBe(1);
    expect(c.freedom).toBe(0);
    expect(c.redundantLinks).toContain('brace');
    expect(c.redundantLinks).toContain('coupler');
    expect(c.redundantLinks).toContain('rocker');
    expect(c.looseJoints).toEqual([]);
  });

  it('localizes redundancy to the braced loop of a Jansen leg', () => {
    const d = withParts(jansenLeg(), { links: [{ id: 'ce', joints: ['C', 'E'] }] });
    const c = analyzeConstraints(compileMechanism(d));
    expect(c.redundancy).toBe(1);
    expect(c.redundantLinks).toContain('ce');
    // 脚先側(f, ghi)は余分な拘束と無関係
    expect(c.redundantLinks).not.toContain('f');
    expect(c.redundantLinks).not.toContain('ghi');
  });

  it('identifies the loose joints of a five-bar with the crank held', () => {
    const c = analyzeConstraints(compileMechanism(fiveBar()));
    expect(c.freedom).toBe(1);
    expect(c.redundancy).toBe(0);
    expect(c.looseJoints.sort()).toEqual(['B', 'F', 'X']);
    expect(c.looseLinks.sort()).toEqual(['coupler', 'r1', 'r2']);
  });

  it('finds a dangling bar as loose', () => {
    const d = withParts(fourBar(), {
      joints: [{ id: 'T', x: 30, y: -20, fixed: false }],
      links: [{ id: 'tail', joints: ['F', 'T'] }],
    });
    const c = analyzeConstraints(compileMechanism(d));
    expect(c.freedom).toBe(1);
    expect(c.looseJoints).toEqual(['T']);
    expect(c.looseLinks).toEqual(['tail']);
  });

  it('does not judge looseness without a crank', () => {
    const d = { ...fourBar(), cranks: [] };
    const c = analyzeConstraints(compileMechanism(d));
    expect(c.crankHeld).toBe(false);
    expect(c.freedom).toBe(1);
    expect(c.looseJoints).toEqual([]);
  });
});

describe('analyzeMechanism constraint attribution (E-04)', () => {
  it('puts redundant links into problemLinks for a locked mechanism', () => {
    const a = analyzeMechanism(bracedFourBar());
    expect(a.dofStatus).toBe('locked');
    expect(a.redundantLinks).toContain('brace');
    expect(a.problemLinks).toContain('brace');
    expect(a.messages.map((m) => m.key)).toContain('analysis.redundantLinks');
    for (const m of a.messages) expect(hasKey(m.key), m.key).toBe(true);
  });

  it('puts loose joints into problemJoints for a loose mechanism', () => {
    const a = analyzeMechanism(fiveBar());
    expect(a.dofStatus).toBe('loose');
    expect(a.looseJoints?.sort()).toEqual(['B', 'F', 'X']);
    for (const j of ['B', 'F', 'X']) expect(a.problemJoints).toContain(j);
    expect(a.problemJoints).not.toContain('A');
    expect(a.messages.map((m) => m.key)).toContain('analysis.looseJoints');
    for (const m of a.messages) expect(hasKey(m.key), m.key).toBe(true);
  });

  it('finds both a braced part and a loose part even when Grubler says 1', () => {
    // 筋交いで固めた四節(-1)+ B からぶら下がる四節(+1)= 自由度 1 だが、実際は両方おかしい
    const base = bracedFourBar();
    const B = base.joints.find((j) => j.id === 'B')!;
    const Q = { x: 80, y: 0 };
    const X = { x: B.x + 15, y: B.y + 10 };
    const Y = dyadPoint(X, 25, Q, 30, 'up');
    const d = withParts(base, {
      joints: [
        { id: 'Q', x: Q.x, y: Q.y, fixed: true },
        { id: 'X', x: X.x, y: X.y, fixed: false },
        { id: 'Y', x: Y.x, y: Y.y, fixed: false },
      ],
      links: [
        { id: 'bx', joints: ['B', 'X'] },
        { id: 'xy', joints: ['X', 'Y'] },
        { id: 'yq', joints: ['Y', 'Q'] },
      ],
    });
    expect(grublerDof(d).dof).toBe(1);
    const a = analyzeMechanism(d);
    expect(a.dofStatus).toBe('ok');
    expect(a.redundantLinks).toContain('brace');
    expect(a.redundantLinks).not.toContain('xy');
    expect(a.looseJoints?.sort()).toEqual(['X', 'Y']);
    expect(a.problemLinks).toContain('brace');
    expect(a.problemJoints).toContain('X');
  });

  it('ignores the apparent singularity of a design drawn in a dead-point pose', () => {
    // 変位点の四節を、全点が一直線に並ぶ姿勢で描いた
    const d = makeFourBar({ ground: 40, crank: 10, coupler: 40, rocker: 10, crankDeg: 0 });
    expect(analyzeConstraints(compileMechanism(d)).freedom).toBe(1); // 設計姿勢では特異
    const a = analyzeMechanism(d);
    expect(a.redundantLinks).toEqual([]);
    expect(a.looseJoints).toEqual([]);
  });
});
