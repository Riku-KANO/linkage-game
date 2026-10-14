import { describe, expect, it } from 'vitest';
import { syntheticWalkGhost } from '@/core/model/ghostFixture';
import { decodeShare, encodeShare } from '@/core/model/share';
import { getStage, initialProgress, recordResult, type RunResult } from '@/game';
import { planShareBoot } from './share';

const ref = getStage('c1-s1')!.reference!;
const run = {
  stageId: 'c1-s2',
  time: 4.2,
  energy: 55.5,
  parts: 10,
  cost: 520,
  cleared: true,
};
const cleared = (stageId: string): RunResult => ({
  stageId,
  cleared: true,
  reason: null,
  time: 4,
  parts: 10,
  cost: 500,
  energy: 50,
  distance: 1.6,
  medals: { time: 'gold', parts: 'gold', cost: 'gold', energy: 'gold' },
});

describe('planShareBoot (FLOW-3)', () => {
  it('does nothing without a share fragment', () => {
    expect(planShareBoot(decodeShare(''), initialProgress())).toEqual({ kind: 'none' });
    expect(planShareBoot(decodeShare('#foo=1'), initialProgress())).toEqual({ kind: 'none' });
  });

  it('loads the shared design into its stage when the stage is unlocked', () => {
    const ghost = syntheticWalkGhost(3);
    const hash = encodeShare({ design: ref, run, ghost });
    const progress = recordResult(initialProgress(), cleared('c1-s1'));
    const plan = planShareBoot(decodeShare(hash), progress);
    expect(plan.kind).toBe('load');
    if (plan.kind !== 'load') return;
    expect(plan.stageId).toBe('c1-s2');
    expect(plan.design.joints.map((j) => j.id)).toEqual(ref.joints.map((j) => j.id));
    expect(plan.opponent).toEqual(run);
    expect(plan.opponentGhost?.frames.length).toBe(ghost.frames.length);
    expect(plan.notices.map((n) => n.key)).toEqual(['model.share.loaded']);
  });

  it('falls back to the sandbox when the stage is still locked', () => {
    const hash = encodeShare({ design: ref, run });
    const plan = planShareBoot(decodeShare(hash), initialProgress());
    expect(plan.kind).toBe('load');
    if (plan.kind !== 'load') return;
    expect(plan.stageId).toBeNull();
    expect(plan.opponent?.stageId).toBe('c1-s2');
    expect(plan.opponentGhost).toBeNull();
    expect(plan.notices.map((n) => n.key)).toEqual(['model.share.loaded', 'flow.share.sandbox']);
  });

  it('loads a design without a record into the sandbox', () => {
    const plan = planShareBoot(decodeShare(encodeShare({ design: ref })), initialProgress());
    expect(plan.kind === 'load' && plan.stageId === null && plan.opponent === null).toBe(true);
  });

  it('reports invalid payloads and ignores them', () => {
    const plan = planShareBoot(decodeShare('#s=not-a-share'), initialProgress());
    expect(plan.kind).toBe('invalid');
    if (plan.kind !== 'invalid') return;
    expect(plan.notices[0]).toMatchObject({ kind: 'share', severity: 'error' });
    expect(plan.notices[0]!.key).toMatch(/^model\.load\./);
  });
});
