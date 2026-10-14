import { describe, expect, it } from 'vitest';
import type { DesignDoc } from '@/core/model/types';
import { hasKey } from '@/i18n';
import { preflight } from './preflight';
import { getStage } from './stages';
import { STANDARD_LEGS } from './designs';

/**
 * KIN-7:グリューブラーの式では自由度 0 でも、平行四辺形のような特殊な寸法で一回転できる機構は
 * 試走を止めない(警告だけ)。本当に固まっている機構(章 2「動かない機械」)は今まで通りエラー。
 */
const doubleParallelogram: DesignDoc = {
  version: 1,
  name: '二重平行四辺形',
  motor: { rpm: -40 },
  legs: { ...STANDARD_LEGS },
  foot: 'F',
  joints: [
    { id: 'O2', x: 0, y: 0, fixed: true },
    { id: 'O4', x: 40, y: 0, fixed: true },
    { id: 'O6', x: 20, y: 0, fixed: true },
    { id: 'A', x: 0, y: 10, fixed: false },
    { id: 'B', x: 40, y: 10, fixed: false },
    { id: 'C', x: 20, y: 10, fixed: false },
    { id: 'F', x: 20, y: -40, fixed: false },
  ],
  links: [
    { id: 'crank', joints: ['O2', 'A'] },
    { id: 'coupler', joints: ['A', 'C', 'B', 'F'] },
    { id: 'rocker', joints: ['O4', 'B'] },
    { id: 'mid', joints: ['O6', 'C'] },
  ],
  cranks: [{ id: 'm', link: 'crank', pivot: 'O2', phase: 0 }],
};

describe('preflight with special geometry (KIN-7)', () => {
  it('warns instead of blocking when a DOF-0 mechanism turns fully', () => {
    const r = preflight(getStage('c1-s3')!, doubleParallelogram);
    const errs = r.problems.filter((p) => p.severity === 'error').map((p) => p.code);
    expect(errs).not.toContain('dofLocked');
    expect(errs).not.toContain('noFullRotation');
    const special = r.problems.find((p) => p.code === 'dofSpecial');
    expect(special?.severity).toBe('warn');
    expect(hasKey(special!.key)).toBe(true);
  });

  it('still blocks the locked machine of chapter 2', () => {
    const st = getStage('c2-s3')!;
    const errs = preflight(st, st.initialDesign!)
      .problems.filter((p) => p.severity === 'error')
      .map((p) => p.code);
    expect(errs).toContain('dofLocked');
  });
});
