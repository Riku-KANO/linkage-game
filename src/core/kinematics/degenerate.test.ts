import { describe, expect, it } from 'vitest';
import { analyzeMechanism } from './analyze';
import { fourBar } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';

describe('too-short links (playtest finding)', () => {
  it('a crank whose pin sits on its axis does not count as turning fully', () => {
    const base = fourBar();
    const o2 = base.joints.find((j) => j.id === 'O2')!;
    const d: DesignDoc = {
      ...base,
      joints: base.joints.map((j) => (j.id === 'A' ? { ...j, x: o2.x + 0.1, y: o2.y } : j)),
    };
    const a = analyzeMechanism(d);
    expect(a.fullRotation).toBe(false);
    expect(a.compiled.issues.some((i) => i.code === 'link-too-short')).toBe(true);
    expect(a.messages.find((m) => m.key === 'analysis.issue.link-too-short')?.severity).toBe(
      'error',
    );
  });
  it('a 1 cm crank (what grid snapping leaves) is also too short', () => {
    const base = fourBar();
    const o2 = base.joints.find((j) => j.id === 'O2')!;
    const d: DesignDoc = {
      ...base,
      joints: base.joints.map((j) => (j.id === 'A' ? { ...j, x: o2.x, y: o2.y + 1 } : j)),
    };
    expect(analyzeMechanism(d).fullRotation).toBe(false);
  });
  it('normal links are not flagged', () => {
    expect(analyzeMechanism(fourBar()).compiled.issues).toEqual([]);
  });
});
