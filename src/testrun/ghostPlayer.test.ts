import { describe, expect, it } from 'vitest';
import { jansenWalker } from '@/core/model/presets';
import { sampleGhost } from '@/core/model/ghost';
import { syntheticWalkGhost } from '@/core/model/ghostFixture';
import { compileMechanism, solvePose } from '@/core/kinematics';
import { mirrorDesignX } from '@/core/kinematics/legs';
import { createGhostPlayer, sampleGhostInto, type GhostPose } from './ghostPlayer';

const pose = (): GhostPose => ({
  position: { x: 0, y: 0, z: 0 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  motorAngle: 0,
});

describe('sampleGhostInto', () => {
  it('matches sampleGhost everywhere (including outside the recording)', () => {
    const g = syntheticWalkGhost(5);
    const out = pose();
    for (const t of [-1, 0, 0.05, 0.31, 1.234, 2.5, 4.99, 5, 9]) {
      const ref = sampleGhost(g, t)!;
      expect(sampleGhostInto(g, t, out)).toBe(true);
      expect(out.position.x).toBeCloseTo(ref.position.x, 12);
      expect(out.position.y).toBeCloseTo(ref.position.y, 12);
      expect(out.position.z).toBeCloseTo(ref.position.z, 12);
      expect(out.quaternion.w).toBeCloseTo(ref.quaternion.w, 12);
      expect(out.quaternion.x).toBeCloseTo(ref.quaternion.x, 12);
      expect(out.motorAngle).toBeCloseTo(ref.motorAngle, 12);
    }
  });

  it('handles empty and single-frame ghosts', () => {
    const out = pose();
    expect(sampleGhostInto({ hz: 10, frames: [] }, 1, out)).toBe(false);
    expect(sampleGhostInto({ hz: 10, frames: [1, 2, 3, 0, 0, 0, 1, 0.5] }, 3, out)).toBe(true);
    expect(out.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(out.motorAngle).toBe(0.5);
  });
});

describe('createGhostPlayer', () => {
  it('reconstructs the body pose and the legs from the motor angle', () => {
    const d = jansenWalker();
    const g = syntheticWalkGhost(4);
    const player = createGhostPlayer(d, g);
    expect(player.duration).toBeCloseTo(4);
    const normal = compileMechanism(d);
    const mirrored = compileMechanism(mirrorDesignX(d));
    for (const t of [0, 0.4, 0.8, 1.7, 3.3]) {
      expect(player.update(t)).toBe(true);
      const s = player.snapshot;
      const ref = sampleGhost(g, t)!;
      expect(s.time).toBe(t);
      expect(s.body.position.x).toBeCloseTo(ref.position.x, 9);
      expect(s.motorAngle).toBeCloseTo(ref.motorAngle, 9);
      s.instances.forEach((inst, k) => {
        const mech = inst.mirrored ? mirrored : normal;
        const r = solvePose(mech, s.motorAngle + inst.phase, { prev: s.legPositions[k]! });
        for (let i = 0; i < r.positions.length; i++) {
          expect(s.legPositions[k]![i]).toBeCloseTo(r.positions[i]!, 6);
        }
      });
    }
    // 巻き戻しても破綻しない
    expect(player.update(0)).toBe(true);
    expect(player.snapshot.time).toBe(0);
  });

  it('returns false for an empty ghost', () => {
    expect(createGhostPlayer(jansenWalker(), { hz: 10, frames: [] }).update(1)).toBe(false);
  });
});
