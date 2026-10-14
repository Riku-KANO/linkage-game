import { describe, expect, it } from 'vitest';
import type { ActiveTransition } from '@/app/store';
import type { Screen } from '@/ui/tokens';
import { classifyTransition, FxDirector, type DirectorInput } from './director';
import { GOAL_SLOWMO } from './timeline';

function tr(
  from: Screen,
  to: Screen,
  startedAt: number,
  opts: Partial<ActiveTransition> = {},
): ActiveTransition {
  return { id: null, from, to, reverse: false, short: false, startedAt, ...opts };
}

function input(
  screen: Screen,
  transition: ActiveTransition | null,
  reduced = false,
): DirectorInput {
  return { screen, transition, settings: { reducedMotion: reduced } };
}

describe('classifyTransition', () => {
  it('maps the screen changes to effects', () => {
    expect(classifyTransition(tr('design', 'testRun', 0))).toBe('assemble');
    expect(classifyTransition(tr('result', 'design', 0))).toBe('disassemble');
    expect(classifyTransition(tr('testRun', 'design', 0, { reverse: true }))).toBe('disassemble');
    expect(classifyTransition(tr('testRun', 'result', 0))).toBe('goal');
    expect(classifyTransition(tr('result', 'testRun', 0, { reverse: true }))).toBeNull();
    expect(classifyTransition(tr('home', 'design', 0))).toBeNull();
  });
});

describe('FxDirector', () => {
  it('assembles over the T-03 duration, keeps the sim paused, then hands over once', () => {
    const d = new FxDirector();
    d.update(input('design', null), 0);
    expect(d.frame.level).toBe(0);
    const t = { ...tr('design', 'testRun', 1000), id: 'T-03' as const };
    let f = d.update(input('testRun', t), 1000);
    expect(f.kind).toBe('assemble');
    expect(f.started).toBe(true);
    expect(f.machineInFx).toBe(true);
    expect(f.timeScale).toBe(0);
    f = d.update(input('testRun', t), 2000);
    expect(f.level).toBeCloseTo(0.5);
    expect(f.started).toBe(false);
    f = d.update(input('testRun', t), 3000);
    expect(f.level).toBe(1);
    expect(f.handover).toBe(true);
    expect(f.machineInFx).toBe(false);
    expect(f.timeScale).toBe(1);
    f = d.update(input('testRun', null), 3016);
    expect(f.handover).toBe(false);
    expect(f.kind).toBeNull();
    expect(f.level).toBe(1);
  });

  it('uses the short duration the second time', () => {
    const d = new FxDirector();
    const t = { ...tr('design', 'testRun', 0, { short: true }), id: 'T-03' as const };
    d.update(input('testRun', t), 0);
    expect(d.update(input('testRun', t), 400).level).toBeCloseTo(0.5);
  });

  it('jumps to the end on skip', () => {
    const d = new FxDirector();
    const t = { ...tr('design', 'testRun', 0), id: 'T-03' as const };
    d.update(input('testRun', t), 0);
    const f = d.update(input('testRun', t), 100, true);
    expect(f.level).toBe(1);
    expect(f.handover).toBe(true);
    expect(d.update(input('testRun', t), 116).handover).toBe(false);
  });

  it('replaces the effect with its end state under reduced motion', () => {
    const d = new FxDirector();
    const t = { ...tr('design', 'testRun', 0), id: 'T-03' as const };
    const f = d.update(input('testRun', t, true), 0);
    expect(f.level).toBe(1);
    expect(f.machineInFx).toBe(false);
    expect(f.handover).toBe(true);
  });

  it('disassembles back onto the paper (T-05)', () => {
    const d = new FxDirector();
    d.update(input('result', null), 0);
    const t = { ...tr('result', 'design', 0), id: 'T-05' as const };
    let f = d.update(input('design', t), 0);
    expect(f.kind).toBe('disassemble');
    expect(f.level).toBe(1);
    f = d.update(input('design', t), 500);
    expect(f.level).toBeCloseTo(0.5);
    expect(f.machineInFx).toBe(true);
    f = d.update(input('design', t), 1000);
    expect(f.level).toBe(0);
    expect(f.handover).toBe(false);
    expect(f.machineInFx).toBe(false);
  });

  it('reverses from where it was when interrupted', () => {
    const d = new FxDirector();
    const a = { ...tr('design', 'testRun', 0), id: 'T-03' as const };
    d.update(input('testRun', a), 0);
    expect(d.update(input('testRun', a), 800).level).toBeCloseTo(0.4);
    const b = {
      ...tr('testRun', 'design', 800, { reverse: true, short: true }),
      id: 'T-03' as const,
    };
    let f = d.update(input('design', b), 800);
    expect(f.kind).toBe('disassemble');
    expect(f.level).toBeCloseTo(0.4);
    expect(f.fromLevel).toBeCloseTo(0.4);
    f = d.update(input('design', b), 800 + 400);
    expect(f.level).toBeCloseTo(0.2);
    f = d.update(input('design', b), 800 + 800);
    expect(f.level).toBe(0);
  });

  it('slows time down at the goal and keeps the result still', () => {
    const d = new FxDirector();
    d.update(input('testRun', null), 0);
    const t = { ...tr('testRun', 'result', 0), id: 'T-04' as const };
    let f = d.update(input('result', t), 0);
    expect(f.kind).toBe('goal');
    expect(f.timeScale).toBe(1);
    f = d.update(input('result', t), 750);
    expect(f.timeScale).toBeCloseTo(GOAL_SLOWMO.slowScale);
    expect(f.machineInFx).toBe(false);
    f = d.update(input('result', t), 1500);
    expect(f.timeScale).toBe(GOAL_SLOWMO.endScale);
    f = d.update(input('result', null), 1600);
    expect(f.timeScale).toBe(GOAL_SLOWMO.endScale);
    // 結果から設計へ:分解の間も止めたまま、設計画面では 1
    const back = { ...tr('result', 'design', 2000), id: 'T-05' as const };
    expect(d.update(input('design', back), 2000).timeScale).toBe(0);
    expect(d.update(input('design', null), 3100).timeScale).toBe(1);
  });

  it('leaves other transitions alone', () => {
    const d = new FxDirector();
    const t = { ...tr('home', 'design', 0), id: 'T-07' as const };
    const f = d.update(input('design', t), 0);
    expect(f.kind).toBeNull();
    expect(f.level).toBe(0);
    expect(f.machineInFx).toBe(false);
    expect(f.timeScale).toBe(1);
  });

  it('follows instant screen jumps', () => {
    const d = new FxDirector();
    expect(d.update(input('testRun', null), 0).level).toBe(1);
    expect(d.update(input('home', null), 16).level).toBe(0);
  });
});
