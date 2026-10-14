import { describe, expect, it } from 'vitest';
import { validateDesign, MAX_LEG_COUNT, MAX_NAME_LENGTH } from './validate';
import { chebyshevLambda, fourBar, jansenLeg, jansenWalker } from './presets';
import { createEmptyDesign, DEFAULT_LEGS, DESIGN_VERSION, MAX_RPM } from './types';
import type { DesignDoc } from './types';

/** JSON を通した「外から来た」データを作る(型を外す) */
const raw = (d: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(d)) as Record<string, unknown>;

function expectErrors(input: unknown, pattern?: RegExp): string[] {
  const r = validateDesign(input);
  expect(r.ok).toBe(false);
  if (r.ok) return [];
  expect(r.errors.length).toBeGreaterThan(0);
  if (pattern) expect(r.errors.join('\n')).toMatch(pattern);
  return r.errors;
}

function expectOk(input: unknown): { design: DesignDoc; warnings: string[] } {
  const r = validateDesign(input);
  if (!r.ok) throw new Error(`expected ok, got: ${r.errors.join('; ')}`);
  return r;
}

describe('validateDesign (MOD-1)', () => {
  it('accepts every preset and the empty design unchanged', () => {
    for (const d of [
      jansenLeg(),
      jansenWalker(),
      chebyshevLambda(),
      fourBar(),
      createEmptyDesign(),
    ]) {
      const r = expectOk(raw(d));
      expect(r.design).toEqual(d);
      expect(r.warnings).toEqual([]);
    }
  });

  it('returns a fresh copy and drops unknown fields', () => {
    const input = raw(jansenLeg());
    input.extra = 'x';
    (input.joints as Record<string, unknown>[])[0]!.color = 'red';
    const r = expectOk(input);
    expect('extra' in r.design).toBe(false);
    expect('color' in r.design.joints[0]!).toBe(false);
    expect(r.design.joints).not.toBe(input.joints);
  });

  it('rejects non-objects', () => {
    for (const v of [null, undefined, 42, 'design', [], true]) expectErrors(v);
  });

  it('rejects a wrong or missing version', () => {
    const d = raw(jansenLeg());
    d.version = 99;
    expectErrors(d, /version/);
    delete d.version;
    expectErrors(d, /version/);
  });

  it('rejects wrong types with a path in the reason', () => {
    const cases: [(d: Record<string, unknown>) => void, RegExp][] = [
      [(d) => (d.name = 3), /name/],
      [(d) => (d.joints = {}), /joints/],
      [(d) => ((d.joints as Record<string, unknown>[])[1]!.x = '12'), /joints\[1\]\.x/],
      [(d) => ((d.joints as Record<string, unknown>[])[1]!.y = null), /joints\[1\]\.y/],
      [(d) => ((d.joints as Record<string, unknown>[])[2]!.fixed = 'yes'), /joints\[2\]\.fixed/],
      [(d) => ((d.joints as Record<string, unknown>[])[0]!.id = ''), /joints\[0\]\.id/],
      [(d) => ((d.joints as Record<string, unknown>[])[0]!.id = 7), /joints\[0\]\.id/],
      [(d) => (d.links = 'nope'), /links/],
      [(d) => ((d.links as Record<string, unknown>[])[0]!.joints = 'OA'), /links\[0\]\.joints/],
      [(d) => (d.cranks = null), /cranks/],
      [(d) => ((d.cranks as Record<string, unknown>[])[0]!.phase = 'x'), /cranks\[0\]\.phase/],
      [(d) => (d.motor = 5), /motor/],
      [(d) => ((d.motor as Record<string, unknown>).rpm = '40'), /motor\.rpm/],
      [(d) => (d.legs = []), /legs/],
      [(d) => ((d.legs as Record<string, unknown>).mirrorX = 1), /legs\.mirrorX/],
      [(d) => ((d.legs as Record<string, unknown>).spacing = 'wide'), /legs\.spacing/],
      [(d) => (d.foot = 3), /foot/],
    ];
    for (const [mutate, pattern] of cases) {
      const d = raw(jansenLeg());
      mutate(d);
      expectErrors(d, pattern);
    }
  });

  it('rejects non-finite numbers (NaN / Infinity cannot come from JSON but can from code)', () => {
    const d = jansenLeg();
    d.joints[0]!.x = Number.NaN;
    expectErrors(d, /joints\[0\]\.x/);
    const e = jansenLeg();
    e.motor.rpm = Number.POSITIVE_INFINITY;
    expectErrors(e, /motor\.rpm/);
  });

  it('rejects coordinates far outside the drawing board', () => {
    const d = jansenLeg();
    d.joints[0]!.x = 1e9;
    expectErrors(d, /joints\[0\]\.x/);
  });

  it('rejects duplicate ids', () => {
    const d = raw(jansenLeg());
    (d.joints as Record<string, unknown>[])[1]!.id = 'O';
    expectErrors(d, /重複/);
    const e = raw(jansenLeg());
    (e.links as Record<string, unknown>[])[1]!.id = 'crank';
    expectErrors(e, /重複/);
    const f = jansenLeg();
    f.cranks.push({ ...f.cranks[0]! });
    expectErrors(f, /重複/);
  });

  it('rejects references to joints and links that do not exist', () => {
    const a = jansenLeg();
    a.links[1]!.joints = ['A', 'Z'];
    expectErrors(a, /links\[1\].*"Z"/);
    const b = jansenLeg();
    b.cranks[0]!.link = 'nope';
    expectErrors(b, /cranks\[0\]\.link.*"nope"/);
    const c = jansenLeg();
    c.cranks[0]!.pivot = 'Q';
    expectErrors(c, /cranks\[0\]\.pivot.*"Q"/);
    const d = jansenLeg();
    d.foot = 'Q';
    expectErrors(d, /foot.*"Q"/);
  });

  it('collects several errors at once', () => {
    const d = raw(jansenLeg());
    (d.joints as Record<string, unknown>[])[0]!.x = 'a';
    d.motor = null;
    expect(expectErrors(d).length).toBeGreaterThanOrEqual(2);
  });

  it('drops duplicate joints inside a link with a warning', () => {
    const d = jansenLeg();
    d.links[2]!.joints = ['B', 'C', 'B', 'D', 'C'];
    const r = expectOk(d);
    expect(r.design.links[2]!.joints).toEqual(['B', 'C', 'D']);
    expect(r.warnings.join()).toMatch(/bde/);
  });

  it('clamps rpm to ±MAX_RPM', () => {
    const d = jansenLeg();
    d.motor.rpm = 500;
    const r = expectOk(d);
    expect(r.design.motor.rpm).toBe(MAX_RPM);
    expect(r.warnings.length).toBe(1);
    d.motor.rpm = -1000;
    expect(expectOk(d).design.motor.rpm).toBe(-MAX_RPM);
  });

  it('normalizes the leg layout', () => {
    const d = jansenLeg();
    d.legs = { count: 0, phaseStepDeg: 720 + 90, spacing: -3, mirrorX: false };
    const r = expectOk(d);
    expect(r.design.legs.count).toBe(1);
    expect(r.design.legs.phaseStepDeg).toBe(90);
    expect(r.design.legs.spacing).toBe(DEFAULT_LEGS.spacing);
    expect(r.warnings.length).toBe(3);

    d.legs = { count: 2.6, phaseStepDeg: -90, spacing: 20, mirrorX: true };
    expect(expectOk(d).design.legs.count).toBe(3);
    d.legs.count = 1000;
    expect(expectOk(d).design.legs.count).toBe(MAX_LEG_COUNT);
    // 負の位相差はそのまま(-360 < v < 360)
    d.legs.count = 2;
    expect(expectOk(d).design.legs.phaseStepDeg).toBe(-90);
  });

  it('defaults a missing foot to null and truncates a long name', () => {
    const d = raw(jansenLeg());
    delete d.foot;
    d.name = 'あ'.repeat(MAX_NAME_LENGTH + 10);
    const r = expectOk(d);
    expect(r.design.foot).toBeNull();
    expect(r.design.name.length).toBe(MAX_NAME_LENGTH);
    expect(r.warnings.length).toBe(2);
  });

  it('keeps mechanically incomplete designs (that is the solver’s job)', () => {
    // クランクの軸が固定点でない、1 点だけのリンク:データとしては壊れていない
    const d = fourBar();
    d.joints[0]!.fixed = false;
    d.links.push({ id: 'stub', joints: ['A'] });
    const r = expectOk(d);
    expect(r.design.links.at(-1)).toEqual({ id: 'stub', joints: ['A'] });
  });

  it('does not throw on hostile input', () => {
    const cyclic: Record<string, unknown> = { version: DESIGN_VERSION };
    cyclic.joints = [cyclic];
    const getter = {
      get version() {
        throw new Error('boom');
      },
    };
    for (const v of [cyclic, getter, Object.create(null), { joints: new Array(5) }]) {
      expect(() => validateDesign(v)).not.toThrow();
      expect(validateDesign(v).ok).toBe(false);
    }
  });
});
