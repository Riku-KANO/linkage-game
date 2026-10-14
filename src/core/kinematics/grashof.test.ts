import { describe, expect, it } from 'vitest';
import { classifyGrashof, findGrashofLoops } from './grashof';
import { compileMechanism } from './compile';
import { analyzeMechanism } from './analyze';
import { makeFourBar } from './testing';
import { chebyshevLambda, fourBar, jansenLeg, JANSEN_LENGTHS } from '@/core/model/presets';
import { hasKey } from '@/i18n';

describe('classifyGrashof (E-05)', () => {
  it('classifies each four-bar type from its lengths', () => {
    expect(classifyGrashof({ ground: 40, input: 10, coupler: 35, output: 30 })).toMatchObject({
      grashof: true,
      type: 'crank-rocker',
      shortest: 'input',
      inputCanRotate: true,
    });
    expect(classifyGrashof({ ground: 10, input: 30, coupler: 35, output: 40 })).toMatchObject({
      grashof: true,
      type: 'double-crank',
      shortest: 'ground',
      inputCanRotate: true,
    });
    expect(classifyGrashof({ ground: 40, input: 30, coupler: 10, output: 35 })).toMatchObject({
      grashof: true,
      type: 'double-rocker',
      shortest: 'coupler',
      inputCanRotate: false,
    });
    // 最短が出力節:出力節は回れるが、入力(クランク)は一回転できない
    expect(classifyGrashof({ ground: 40, input: 30, coupler: 35, output: 10 })).toMatchObject({
      grashof: true,
      type: 'crank-rocker',
      shortest: 'output',
      inputCanRotate: false,
    });
    expect(classifyGrashof({ ground: 40, input: 10, coupler: 40, output: 10 })).toMatchObject({
      grashof: true,
      type: 'change-point',
      inputCanRotate: true,
    });
    expect(classifyGrashof({ ground: 40, input: 28, coupler: 35, output: 30 })).toMatchObject({
      grashof: false,
      type: 'triple-rocker',
      inputCanRotate: false,
    });
  });
});

describe('findGrashofLoops (E-05)', () => {
  it('finds the single loop of a four-bar with its links, joints and lengths', () => {
    const loops = findGrashofLoops(compileMechanism(fourBar()));
    expect(loops).toHaveLength(1);
    const g = loops[0]!;
    expect(g.links).toEqual([null, 'crank', 'coupler', 'rocker']);
    expect(g.joints).toEqual(['O2', 'A', 'B', 'O4']);
    expect(g.crank).toBe('motor');
    expect(g.lengths.ground).toBeCloseTo(40, 6);
    expect(g.lengths.input).toBeCloseTo(10, 6);
    expect(g.lengths.coupler).toBeCloseTo(35, 6);
    expect(g.lengths.output).toBeCloseTo(30, 6);
    expect(g.type).toBe('crank-rocker');
    expect(g.inputCanRotate).toBe(true);
  });

  it("classifies Jansen's first loop (O, A, C via link j, B) as crank-rocker", () => {
    const loops = findGrashofLoops(compileMechanism(jansenLeg()));
    const first = loops.find((l) => l.links[2] === 'j');
    expect(first).toBeDefined();
    expect(first!.joints).toEqual(['O', 'A', 'C', 'B']);
    expect(first!.links).toEqual([null, 'crank', 'j', 'bde']);
    expect(first!.lengths.input).toBeCloseTo(JANSEN_LENGTHS.m, 5);
    expect(first!.lengths.coupler).toBeCloseTo(JANSEN_LENGTHS.j, 5);
    expect(first!.lengths.output).toBeCloseTo(JANSEN_LENGTHS.b, 5);
    expect(first!.lengths.ground).toBeCloseTo(Math.hypot(JANSEN_LENGTHS.a, JANSEN_LENGTHS.l), 5);
    expect(first!.type).toBe('crank-rocker');
    // second loop O, A, E, B (via k and c) is a crank-rocker too
    const second = loops.find((l) => l.links[2] === 'k');
    expect(second?.type).toBe('crank-rocker');
    expect(loops).toHaveLength(2);
  });

  it('finds the Chebyshev loop through the coupler midpoint', () => {
    const loops = findGrashofLoops(compileMechanism(chebyshevLambda()));
    expect(loops).toHaveLength(1);
    expect(loops[0]!.joints).toEqual(['O2', 'A', 'M', 'O4']);
    expect(loops[0]!.type).toBe('crank-rocker');
  });

  it('classifies assemblable four-bars of every type', () => {
    const cases = [
      { spec: { ground: 40, crank: 10, coupler: 35, rocker: 30 }, type: 'crank-rocker', rot: true },
      { spec: { ground: 10, crank: 30, coupler: 35, rocker: 40 }, type: 'double-crank', rot: true },
      {
        spec: { ground: 40, crank: 30, coupler: 10, rocker: 35, crankDeg: 60 },
        type: 'double-rocker',
        rot: false,
      },
      {
        spec: { ground: 40, crank: 30, coupler: 35, rocker: 10, crankDeg: 60 },
        type: 'crank-rocker',
        rot: false,
      },
      { spec: { ground: 40, crank: 10, coupler: 40, rocker: 10 }, type: 'change-point', rot: true },
      {
        spec: { ground: 40, crank: 28, coupler: 35, rocker: 30 },
        type: 'triple-rocker',
        rot: false,
      },
    ] as const;
    for (const c of cases) {
      const loops = findGrashofLoops(compileMechanism(makeFourBar(c.spec)));
      expect(loops, c.type).toHaveLength(1);
      expect(loops[0]!.type, JSON.stringify(c.spec)).toBe(c.type);
      expect(loops[0]!.inputCanRotate, JSON.stringify(c.spec)).toBe(c.rot);
    }
  });

  it('agrees with the sampled cycle about full rotation', () => {
    for (const spec of [
      { ground: 40, crank: 10, coupler: 35, rocker: 30 },
      { ground: 10, crank: 30, coupler: 35, rocker: 40 },
      { ground: 40, crank: 30, coupler: 35, rocker: 10, crankDeg: 60 },
      { ground: 40, crank: 28, coupler: 35, rocker: 30 },
    ]) {
      const a = analyzeMechanism(makeFourBar(spec));
      expect(a.grashof[0]!.inputCanRotate, JSON.stringify(spec)).toBe(a.fullRotation);
    }
  });
});

describe('analyzeMechanism grashof output', () => {
  it('fills analysis.grashof and pushes translated messages', () => {
    const a = analyzeMechanism(jansenLeg());
    expect(a.grashof).toHaveLength(2);
    const keys = a.messages.map((m) => m.key);
    expect(keys).toContain('analysis.grashof.crank-rocker');
    // 同じ判定は 1 つのメッセージにまとめる
    expect(keys.filter((k) => k === 'analysis.grashof.crank-rocker')).toHaveLength(1);
    for (const m of a.messages) expect(hasKey(m.key), m.key).toBe(true);
  });

  it('warns when the crank cannot fully rotate by Grashof', () => {
    const a = analyzeMechanism(makeFourBar({ ground: 40, crank: 28, coupler: 35, rocker: 30 }));
    const msg = a.messages.find((m) => m.key === 'analysis.grashof.triple-rocker');
    expect(msg?.severity).toBe('warn');
    const b = analyzeMechanism(
      makeFourBar({ ground: 40, crank: 30, coupler: 35, rocker: 10, crankDeg: 60 }),
    );
    expect(b.messages.map((m) => m.key)).toContain('analysis.grashof.rocker-crank');
    for (const m of [...a.messages, ...b.messages]) expect(hasKey(m.key), m.key).toBe(true);
  });
});
