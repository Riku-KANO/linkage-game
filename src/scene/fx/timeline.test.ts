import { describe, expect, it } from 'vitest';
import {
  ASSEMBLY_PHASES,
  eventsBetween,
  goalTimeScale,
  GOAL_SLOWMO,
  instanceOrder,
  partRise,
  planAssembly,
  soundFor,
  riseOrder,
  spanProgress,
  staggerSpans,
  type FxEvent,
  type PartRise,
} from './timeline';

describe('staggerSpans', () => {
  it('spreads n spans of fixed length across the span without leaving it', () => {
    const s = staggerSpans(5, { start: 0.2, end: 0.6 }, 0.1);
    expect(s).toHaveLength(5);
    expect(s[0]!.start).toBeCloseTo(0.2);
    expect(s[4]!.end).toBeCloseTo(0.6);
    for (let i = 1; i < 5; i++) expect(s[i]!.start).toBeGreaterThan(s[i - 1]!.start);
    s.forEach((x) => expect(x.end - x.start).toBeCloseTo(0.1));
  });
  it('handles a single item and an over-long duration', () => {
    expect(staggerSpans(1, { start: 0.1, end: 0.3 }, 0.5)).toEqual([{ start: 0.1, end: 0.3 }]);
    expect(staggerSpans(0, { start: 0, end: 1 }, 0.1)).toEqual([]);
  });
});

describe('riseOrder', () => {
  it('starts at the crank and walks the mechanism breadth-first', () => {
    // 0: crank (0-1), 1: coupler (1-2), 2: rocker (2-3), 3: foot plate (2-4-5), 4: lone (6-7)
    const links = [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4, 5],
      [6, 7],
    ];
    expect(riseOrder(links, [0])).toEqual([0, 1, 2, 3, 4]);
  });
  it('falls back to links on fixed joints when there is no crank', () => {
    const links = [
      [1, 2],
      [0, 1],
      [2, 3],
    ];
    expect(riseOrder(links, [], [3])[0]).toBe(2);
  });
  it('visits every link exactly once', () => {
    const links = [
      [0, 1],
      [5, 6],
      [1, 2],
      [6, 7],
      [2, 0],
    ];
    const o = riseOrder(links, [3]);
    expect([...o].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('instanceOrder', () => {
  it('begins near z = 0 and alternates outwards, normal legs first', () => {
    const inst = [-0.3, -0.1, 0.1, 0.3].map((z, i) => ({ z, mirrored: i % 2 === 1 }));
    const o = instanceOrder(inst);
    expect(o[0]).toBe(2); // z = 0.1, not mirrored
    expect(o[1]).toBe(1); // z = −0.1, mirrored
    expect(new Set(o).size).toBe(4);
  });
});

describe('planAssembly', () => {
  const input = {
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4, 5],
    ],
    crankLinks: [0],
    fixedJoints: [0, 3],
    jointCount: 6,
    instances: [-0.18, -0.06, 0.06, 0.18].map((z, i) => ({ z, mirrored: i % 2 === 1 })),
  };
  const plan = planAssembly(input, 5);

  it('raises parts inside the rise phase, crank first', () => {
    const P = ASSEMBLY_PHASES.rise;
    plan.parts.forEach((s) => {
      expect(s.start).toBeGreaterThanOrEqual(P.start - 1e-9);
      expect(s.end).toBeLessThanOrEqual(P.end + 1e-9);
    });
    expect(plan.parts[0]!.start).toBeLessThan(plan.parts[3]!.start);
  });
  it('locks a pin only after every link through it has risen', () => {
    expect(plan.pinLock[3]).toBeCloseTo(Math.max(plan.parts[2]!.end, plan.parts[3]!.end));
    expect(plan.pinLock[0]).toBeCloseTo(plan.parts[0]!.end);
  });
  it('duplicates legs inside the duplicate phase, primary first', () => {
    const P = ASSEMBLY_PHASES.duplicate;
    expect(plan.instances[plan.primary]!.start).toBeCloseTo(P.start);
    plan.instances.forEach((s) => expect(s.end).toBeLessThanOrEqual(P.end + 1e-9));
    expect(plan.frames).toHaveLength(5);
  });
  it('keeps the phases in assembly order', () => {
    const P = ASSEMBLY_PHASES;
    expect(P.rise.start).toBe(0);
    expect(P.duplicate.start).toBeGreaterThan(P.rise.start);
    expect(P.chassis.end).toBeLessThanOrEqual(P.carry.start);
    expect(P.hookIn.end).toBeLessThanOrEqual(P.carry.start);
    expect(P.carry.end).toBeLessThanOrEqual(P.lower.start);
    expect(P.lower.end).toBeLessThanOrEqual(P.hookOut.start);
    expect(P.hookOut.end).toBe(1);
    expect(P.grow.start).toBeGreaterThan(P.carry.start);
    expect(P.grow.end).toBeLessThanOrEqual(P.carry.end);
  });
  it('has sorted sound events inside (0, 1)', () => {
    for (let i = 1; i < plan.events.length; i++) {
      expect(plan.events[i]!.u).toBeGreaterThanOrEqual(plan.events[i - 1]!.u);
    }
    plan.events.forEach((e) => {
      expect(e.u).toBeGreaterThan(0);
      expect(e.u).toBeLessThanOrEqual(1);
      expect(e.volume).toBeLessThanOrEqual(0.6);
    });
    expect(plan.events.some((e) => e.sfx === 'gear')).toBe(true);
    expect(plan.events.some((e) => e.sfx === 'step')).toBe(true);
  });
  it('limits the duplicate ticks for long leg arrays', () => {
    const many = planAssembly(
      {
        ...input,
        instances: Array.from({ length: 24 }, (_, k) => ({ z: k * 0.1 - 1.2, mirrored: false })),
      },
      25,
    );
    const ticks = many.events.filter((e) => e.sfx === 'press' && e.rate > 1.5);
    expect(ticks.length).toBeLessThanOrEqual(7);
  });
});

describe('eventsBetween', () => {
  const ev: FxEvent[] = [
    { u: 0.1, sfx: 'snap', volume: 1, rate: 1 },
    { u: 0.2, sfx: 'press', volume: 1, rate: 1 },
    { u: 0.3, sfx: 'step', volume: 1, rate: 1 },
  ];
  const out: FxEvent[] = [];
  it('returns events crossed going forward', () => {
    expect(eventsBetween(ev, 0.05, 0.2, out)).toBe(2);
    expect(out.map((e) => e.sfx)).toEqual(['snap', 'press']);
  });
  it('returns events crossed going backward, in crossing order', () => {
    expect(eventsBetween(ev, 0.31, 0.1, out)).toBe(3);
    expect(out.map((e) => e.sfx)).toEqual(['step', 'press', 'snap']);
  });
  it('is silent on jumps (skip) and when standing still', () => {
    expect(eventsBetween(ev, 0, 1, out)).toBe(0);
    expect(eventsBetween(ev, 0.2, 0.2, out)).toBe(0);
  });
});

describe('soundFor', () => {
  it('plays the forward sound when assembling and the reverse one (or none) when taking apart', () => {
    const plain: FxEvent = { u: 0.5, sfx: 'snap', volume: 0.3, rate: 1 };
    const silent: FxEvent = { ...plain, reverse: null };
    const swapped: FxEvent = { ...plain, reverse: { sfx: 'release', volume: 0.1, rate: 1.2 } };
    expect(soundFor(plain, false)?.sfx).toBe('snap');
    expect(soundFor(plain, true)?.sfx).toBe('snap');
    expect(soundFor(silent, true)).toBeNull();
    expect(soundFor(swapped, true)?.sfx).toBe('release');
    expect(soundFor(swapped, false)?.sfx).toBe('snap');
  });
  it('gives the crane a gear and the touchdown a step', () => {
    const plan = planAssembly(
      {
        links: [[0, 1]],
        crankLinks: [0],
        fixedJoints: [0],
        jointCount: 2,
        instances: [{ z: 0, mirrored: false }],
      },
      2,
    );
    const at = (u: number) => plan.events.filter((e) => Math.abs(e.u - u) < 0.02).map((e) => e.sfx);
    expect(at(ASSEMBLY_PHASES.carry.start)).toContain('gear');
    expect(at(ASSEMBLY_PHASES.lower.end)).toContain('step');
  });
});

describe('partRise', () => {
  const r: PartRise = { angle: 0, hop: 0, thickness: 0 };
  const span = { start: 0.1, end: 0.2 };
  it('lies flat and thin before its window and stands up thick after', () => {
    partRise(0, span, r);
    expect(r.angle).toBeCloseTo(-Math.PI / 2);
    expect(r.thickness).toBeLessThan(0.1);
    partRise(0.25, span, r);
    expect(r.angle).toBeCloseTo(0);
    expect(r.thickness).toBeCloseTo(1);
    expect(r.hop).toBeCloseTo(0);
  });
  it('is continuous across the window', () => {
    let prev = partRise(0.1, span, { angle: 0, hop: 0, thickness: 0 }).angle;
    for (let u = 0.1; u <= 0.2001; u += 0.002) {
      const a = partRise(u, span, r).angle;
      expect(Math.abs(a - prev)).toBeLessThan(0.15);
      prev = a;
    }
  });
});

describe('goalTimeScale', () => {
  it('slows down quickly at the goal, holds, then stops for the result', () => {
    expect(goalTimeScale(0)).toBe(1);
    expect(goalTimeScale(GOAL_SLOWMO.easeIn)).toBeCloseTo(GOAL_SLOWMO.slowScale);
    expect(goalTimeScale(0.5)).toBeCloseTo(GOAL_SLOWMO.slowScale);
    expect(goalTimeScale(1)).toBe(GOAL_SLOWMO.endScale);
  });
  it('never speeds up along the way', () => {
    let prev = 1;
    for (let t = 0; t <= 1; t += 0.01) {
      const s = goalTimeScale(t);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      expect(s).toBeGreaterThanOrEqual(0);
      prev = s;
    }
  });
});

describe('spanProgress', () => {
  it('clamps to 0..1', () => {
    expect(spanProgress(-1, { start: 0, end: 1 })).toBe(0);
    expect(spanProgress(0.5, { start: 0, end: 1 })).toBe(0.5);
    expect(spanProgress(2, { start: 0, end: 1 })).toBe(1);
    expect(spanProgress(0.5, { start: 0.5, end: 0.5 })).toBe(1);
  });
});
