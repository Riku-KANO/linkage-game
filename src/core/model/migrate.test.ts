import { describe, expect, it } from 'vitest';
import {
  APP_ID,
  applyMigrations,
  migrate,
  readDesign,
  toEnvelope,
  type DesignV0,
  type Migration,
} from './migrate';
import { chebyshevLambda, jansenLeg, jansenWalker } from './presets';
import { DEFAULT_LEGS, DESIGN_VERSION } from './types';
import type { DesignDoc } from './types';
import { computeBill } from './parts';

/** v1 の設計を合成した旧形式 v0 に戻す(テスト用) */
function toV0(d: DesignDoc): DesignV0 {
  return {
    name: d.name,
    joints: d.joints.map(({ id, x, y }) => ({ id, x, y })),
    fixed: d.joints.filter((j) => j.fixed).map((j) => j.id),
    links: d.links.map((l) => ({ id: l.id, joints: [...l.joints] })),
    cranks: d.cranks.map(({ id, link, pivot }) => ({ id, link, pivot })),
    foot: d.foot,
    rpm: d.motor.rpm,
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('migrate (MOD-2)', () => {
  it('passes a current-version design through', () => {
    const d = jansenWalker();
    const r = migrate(clone(d));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fromVersion).toBe(DESIGN_VERSION);
    expect(r.data).toEqual(d);
  });

  it('unwraps the versioned envelope', () => {
    const d = chebyshevLambda();
    const env = toEnvelope(d, '2026-10-15T00:00:00.000Z');
    expect(env).toMatchObject({ app: APP_ID, kind: 'design', version: DESIGN_VERSION });
    const r = readDesign(clone(env));
    expect(r.ok && r.design).toEqual(d);
  });

  it('upgrades the synthetic legacy v0 format to the current version', () => {
    const v1 = jansenLeg();
    const v0 = toV0(v1);
    const r = readDesign(clone(v0));
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.fromVersion).toBe(0);
    expect(r.design.version).toBe(DESIGN_VERSION);
    expect(r.design.joints).toEqual(v1.joints);
    expect(r.design.links).toEqual(v1.links);
    expect(r.design.cranks).toEqual(v1.cranks.map((c) => ({ ...c, phase: 0 })));
    expect(r.design.motor).toEqual({ rpm: v1.motor.rpm });
    expect(r.design.legs).toEqual(DEFAULT_LEGS);
    expect(r.design.foot).toBe('G');
    expect(computeBill(r.design)).toEqual(computeBill(v1));
  });

  it('accepts an explicit version 0 and an enveloped v0', () => {
    const v0 = { ...toV0(chebyshevLambda()), version: 0 };
    expect(readDesign(clone(v0)).ok).toBe(true);
    const env = { app: APP_ID, kind: 'design', version: 0, design: toV0(chebyshevLambda()) };
    const r = readDesign(clone(env));
    expect(r.ok && r.fromVersion).toBe(0);
  });

  it('fills defaults for optional v0 fields and warns about stale fixed ids', () => {
    const v0 = {
      joints: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 10, y: 0 },
      ],
      fixed: ['a', 'ghost'],
      links: [{ id: 'l', joints: ['a', 'b'] }],
      cranks: [{ id: 'c', link: 'l', pivot: 'a' }],
    };
    const r = readDesign(v0);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.design.name.length).toBeGreaterThan(0);
    expect(r.design.foot).toBeNull();
    expect(r.design.motor.rpm).toBe(30);
    expect(r.design.joints.map((j) => j.fixed)).toEqual([true, false]);
    expect(r.warnings.join()).toMatch(/ghost/);
  });

  it('rejects unknown future versions with a clear error', () => {
    const future = { ...clone(jansenLeg()), version: DESIGN_VERSION + 1 };
    const r = migrate(future);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('version');
    expect(r.errors.join()).toMatch(new RegExp(`${DESIGN_VERSION + 1}`));
    const env = { app: APP_ID, kind: 'design', version: 99, design: {} };
    const e = readDesign(env);
    expect(!e.ok && e.reason).toBe('version');
  });

  it('rejects malformed versions and foreign envelopes', () => {
    for (const version of ['1', -1, 0.5, null, Number.NaN]) {
      const r = migrate({ ...clone(jansenLeg()), version });
      expect(!r.ok && r.reason).toBe('invalid');
    }
    const foreign = migrate({ app: 'other-game', version: 1, design: clone(jansenLeg()) });
    expect(!foreign.ok && foreign.reason).toBe('foreign');
    for (const v of [null, 3, 'x', [1, 2]]) {
      expect(migrate(v).ok).toBe(false);
    }
  });

  it('reports garbage that migrates but does not validate as invalid', () => {
    const r = readDesign({ joints: 'nope', fixed: [] });
    expect(!r.ok && r.reason).toBe('invalid');
  });

  it('does not mutate its input', () => {
    const v0 = toV0(jansenLeg());
    const before = clone(v0);
    readDesign(v0);
    expect(v0).toEqual(before);
  });

  it('chains migration steps in order (framework)', () => {
    const table: Record<number, Migration> = {
      0: (d) => ({ ...d, trail: [...((d.trail as number[] | undefined) ?? []), 0] }),
      1: (d) => ({ ...d, trail: [...(d.trail as number[]), 1] }),
      2: (d, warn) => {
        warn('step 2');
        return { ...d, trail: [...(d.trail as number[]), 2] };
      },
    };
    const r = applyMigrations({}, 0, 3, table);
    expect(r.ok && r.data).toEqual({ trail: [0, 1, 2], version: 3 });
    expect(r.ok && r.warnings).toEqual(['step 2']);
    const partial = applyMigrations({ trail: [9] }, 2, 3, table);
    expect(partial.ok && partial.data).toEqual({ trail: [9, 2], version: 3 });
  });

  it('fails cleanly when a step is missing or throws', () => {
    const missing = applyMigrations({}, 0, 2, { 0: (d) => d });
    expect(!missing.ok && missing.reason).toBe('invalid');
    const throwing = applyMigrations({}, 0, 1, {
      0: () => {
        throw new Error('bad');
      },
    });
    expect(!throwing.ok && throwing.reason).toBe('invalid');
  });
});
