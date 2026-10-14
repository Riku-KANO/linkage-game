import { describe, expect, it } from 'vitest';
import { SPRINGS } from '@/ui/tokens';
import type { TerrainSpec, Vec3 } from '@/core/sim/types';
import {
  createSpring3,
  DEFAULT_FOLLOW,
  followCameraGoal,
  followLookTarget,
  lastSpringVelocity,
  liftAboveTerrain,
  springStep1D,
  stepSpring3,
} from './follow';
import { terrainHeightAt } from './terrain';

const F = SPRINGS.follow;

function simulate1D(frames: number[], k: number = F.stiffness, c: number = F.damping) {
  let x = 0;
  let v = 0;
  for (const dt of frames) {
    x = springStep1D(x, v, 1, k, c, dt);
    v = lastSpringVelocity();
  }
  return { x, v };
}

describe('springStep1D', () => {
  it('converges to the target without noticeable overshoot (follow spring is near-critical)', () => {
    let x = 0;
    let v = 0;
    let max = 0;
    for (let i = 0; i < 600; i++) {
      x = springStep1D(x, v, 1, F.stiffness, F.damping, 1 / 60);
      v = lastSpringVelocity();
      max = Math.max(max, x);
    }
    expect(x).toBeCloseTo(1, 6);
    expect(max).toBeLessThan(1.001);
  });

  it('is frame-rate independent for a fixed target (exact solution)', () => {
    const a = simulate1D(Array.from({ length: 60 }, () => 1 / 60));
    const b = simulate1D(Array.from({ length: 144 }, () => 1 / 144));
    const c = simulate1D([0.5, 0.25, 0.125, 0.125]);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(c.x).toBeCloseTo(a.x, 9);
    expect(c.v).toBeCloseTo(a.v, 9);
  });

  it('handles critical and over-damped springs', () => {
    const k = 40;
    for (const c of [2 * Math.sqrt(k), 30]) {
      const a = simulate1D(
        Array.from({ length: 120 }, () => 1 / 60),
        k,
        c,
      );
      const b = simulate1D([1, 1], k, c);
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(a.x).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('is stable for huge frame times', () => {
    const r = simulate1D([10]);
    expect(r.x).toBeCloseTo(1, 6);
    expect(Number.isFinite(r.v)).toBe(true);
  });

  it('ignores non-positive dt', () => {
    expect(springStep1D(0.3, 2, 1, 40, 12, 0)).toBe(0.3);
    expect(lastSpringVelocity()).toBe(2);
  });
});

describe('stepSpring3', () => {
  it('moves all axes toward the target', () => {
    const s = createSpring3(0, 0, 0);
    for (let i = 0; i < 300; i++) stepSpring3(s, 1, 2, 3, F, 1 / 60);
    expect(s.x).toBeCloseTo(1, 4);
    expect(s.y).toBeCloseTo(2, 4);
    expect(s.z).toBeCloseTo(3, 4);
  });
});

describe('follow targets', () => {
  it('looks ahead in the walking direction, clamped', () => {
    const out: Vec3 = { x: 0, y: 0, z: 0 };
    followLookTarget({ x: 1, y: 0.5, z: 0 }, { x: 0.3, y: 0, z: 0 }, DEFAULT_FOLLOW, out);
    expect(out.x).toBeCloseTo(1 + 0.3 * DEFAULT_FOLLOW.lookAhead);
    followLookTarget({ x: 1, y: 0.5, z: 0 }, { x: 50, y: 0, z: 0 }, DEFAULT_FOLLOW, out);
    expect(out.x).toBeCloseTo(1 + DEFAULT_FOLLOW.maxLookAhead);
    followLookTarget({ x: 1, y: 0.5, z: 0 }, { x: Number.NaN, y: 0, z: 0 }, DEFAULT_FOLLOW, out);
    expect(out.x).toBe(1);
  });

  it('places the camera at look + offset × scale', () => {
    const out: Vec3 = { x: 0, y: 0, z: 0 };
    followCameraGoal({ x: 1, y: 1, z: 0 }, DEFAULT_FOLLOW, 2, out);
    expect(out.z).toBeCloseTo(DEFAULT_FOLLOW.offset.z * 2);
    expect(out.y).toBeCloseTo(1 + DEFAULT_FOLLOW.offset.y * 2);
  });
});

describe('liftAboveTerrain', () => {
  const wall: TerrainSpec = {
    ground: { y: 0 },
    shapes: [{ kind: 'box', min: [-1, 0, 1], max: [1, 1.2, 1.5] }],
  };
  const h = (x: number, z: number) => terrainHeightAt(wall, x, z);

  it('raises the camera over a wall between it and the target', () => {
    const cam = { x: 0, y: 0.5, z: 3 };
    const look = { x: 0, y: 0.4, z: 0 };
    expect(liftAboveTerrain(cam, look, h, 0.2)).toBe(true);
    // 線分上のどの点も壁 + 余裕より上
    for (let s = 0.3; s <= 1; s += 0.01) {
      const y = look.y + s * (cam.y - look.y);
      const z = look.z + s * (cam.z - look.z);
      expect(y).toBeGreaterThanOrEqual(h(0, z) + 0.2 - 1e-9);
    }
  });

  it('keeps the camera above the ground directly below it', () => {
    const cam = { x: 0, y: -0.5, z: -3 };
    liftAboveTerrain(cam, { x: 0, y: 0.3, z: 0 }, h, 0.25);
    expect(cam.y).toBeGreaterThanOrEqual(0.25);
  });

  it('does not move a camera that already clears the terrain', () => {
    const cam = { x: 0, y: 6, z: 4 };
    expect(liftAboveTerrain(cam, { x: 0, y: 0.4, z: 0 }, h, 0.2)).toBe(false);
    expect(cam.y).toBe(6);
  });

  it('copes with no terrain at all', () => {
    const cam = { x: 0, y: 1, z: 1 };
    expect(liftAboveTerrain(cam, { x: 0, y: 0, z: 0 }, () => -Infinity, 0.2)).toBe(false);
  });
});
