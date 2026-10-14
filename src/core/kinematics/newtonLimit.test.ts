import { describe, expect, it } from 'vitest';
import { compileMechanism, MAX_NEWTON_JOINTS } from './compile';
import { analyzeMechanism } from './analyze';
import { hasKey } from '@/i18n';
import type { DesignDoc, Joint, Link } from '@/core/model/types';

/**
 * 三角リンクを 3 本の棒で支える組(Assur 群のクラス 3)を n 個つなぐ。2 円の交点では解けず、
 * 全部がひとつのニュートン法のブロックになる(未知点 3n 個)。
 */
function triadChain(n: number): DesignDoc {
  const joints: Joint[] = [
    { id: 'O', x: 0, y: 0, fixed: true },
    { id: 'K', x: 5, y: 0, fixed: false },
  ];
  const links: Link[] = [{ id: 'crank', joints: ['O', 'K'] }];
  let anchors = ['K', 'G1', 'G2'];
  joints.push({ id: 'G1', x: 60, y: 0, fixed: true }, { id: 'G2', x: 30, y: 50, fixed: true });
  for (let k = 0; k < n; k++) {
    const ox = 80 * (k + 1);
    const t = [`T${k}a`, `T${k}b`, `T${k}c`];
    joints.push(
      { id: t[0]!, x: ox + 20, y: 10, fixed: false },
      { id: t[1]!, x: ox + 40, y: 12, fixed: false },
      { id: t[2]!, x: ox + 30, y: 28, fixed: false },
    );
    links.push({ id: `tri${k}`, joints: t });
    t.forEach((tj, i) => links.push({ id: `b${k}${i}`, joints: [anchors[i]!, tj] }));
    anchors = t;
  }
  return {
    version: 1,
    name: 'triads',
    joints,
    links,
    cranks: [{ id: 'm', link: 'crank', pivot: 'O', phase: 0 }],
    foot: null,
    motor: { rpm: 30 },
    legs: { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false },
  };
}

describe('Newton block size limit', () => {
  it('accepts a small non-dyadic group', () => {
    const m = compileMechanism(triadChain(1));
    expect(m.plan.some((s) => s.kind === 'newton')).toBe(true);
    expect(m.issues.map((i) => i.code)).not.toContain('newton-too-large');
  });

  it('flags a block with more than MAX_NEWTON_JOINTS unknown joints', () => {
    const n = Math.ceil((MAX_NEWTON_JOINTS + 1) / 3);
    const m = compileMechanism(triadChain(n));
    const issue = m.issues.find((i) => i.code === 'newton-too-large');
    expect(issue).toBeDefined();
    expect(issue!.jointIds!.length).toBeGreaterThan(MAX_NEWTON_JOINTS);
    const a = analyzeMechanism(triadChain(n), { steps: 12 });
    const msg = a.messages.find((x) => x.key === 'analysis.issue.newton-too-large');
    expect(msg?.severity).toBe('error');
    expect(hasKey('analysis.issue.newton-too-large')).toBe(true);
  });
});
