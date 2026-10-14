import { describe, expect, it } from 'vitest';
import { createPose } from '@/scene/rig/pose';
import { DEFAULT_FOLLOW } from '@/testrun/follow';
import {
  createFollowRig,
  dockPoseLeft,
  followPose,
  RESULT_DOCK_MIN_WIDTH,
  stepFollowRig,
} from './camera';

const flat = () => 0;

describe('follow camera station (INT-2)', () => {
  it('has no pose until the first step, then snaps behind-and-above the machine', () => {
    const rig = createFollowRig();
    expect(followPose(rig, createPose())).toBeNull();
    stepFollowRig(rig, {
      focus: { x: -8, y: 0.5, z: -14 },
      velocity: { x: 0, y: 0, z: 0 },
      time: 0,
      scale: 1,
      heightAt: flat,
      dt: 1 / 60,
    });
    const pose = followPose(rig, createPose({ fov: 50, ortho: 0.3 }))!;
    expect(pose.target).toEqual([-8, 0.5, -14]);
    expect(pose.position[0]).toBeCloseTo(-8 + DEFAULT_FOLLOW.offset.x, 12);
    expect(pose.position[1]).toBeCloseTo(0.5 + DEFAULT_FOLLOW.offset.y, 12);
    expect(pose.position[2]).toBeCloseTo(-14 + DEFAULT_FOLLOW.offset.z, 12);
    // 画角は既定の定位置のまま、投影は透視
    expect(pose.fov).toBe(50);
    expect(pose.ortho).toBe(0);
  });

  it('follows with a spring (lags behind, converges) and looks ahead along the velocity', () => {
    const rig = createFollowRig();
    const input = {
      focus: { x: 0, y: 0.5, z: -14 },
      velocity: { x: 0, y: 0, z: 0 },
      time: 0,
      scale: 1,
      heightAt: flat,
      dt: 1 / 60,
    };
    stepFollowRig(rig, input);
    input.focus = { x: 1, y: 0.5, z: -14 };
    input.time = 0.1;
    stepFollowRig(rig, input);
    expect(rig.target[0]).toBeGreaterThan(0);
    expect(rig.target[0]).toBeLessThan(1);
    for (let k = 0; k < 600; k++) {
      input.time += 1 / 60;
      stepFollowRig(rig, input);
    }
    expect(rig.target[0]).toBeCloseTo(1, 4);
    input.velocity = { x: 0.5, y: 0, z: 0 };
    for (let k = 0; k < 600; k++) {
      input.time += 1 / 60;
      stepFollowRig(rig, input);
    }
    expect(rig.target[0]).toBeCloseTo(1 + Math.min(0.5 * DEFAULT_FOLLOW.lookAhead, 0.6), 3);
  });

  it('snaps (no spring) when the run restarts and time goes back', () => {
    const rig = createFollowRig();
    const input = {
      focus: { x: 3, y: 0.5, z: -14 },
      velocity: { x: 0, y: 0, z: 0 },
      time: 2,
      scale: 1,
      heightAt: flat,
      dt: 1 / 60,
    };
    stepFollowRig(rig, input);
    stepFollowRig(rig, { ...input, focus: { x: 0, y: 0.5, z: -14 }, time: 0 });
    expect(rig.target[0]).toBe(0);
  });

  it('keeps the camera above a tall terrain', () => {
    const rig = createFollowRig();
    stepFollowRig(rig, {
      focus: { x: 0, y: 0.5, z: -14 },
      velocity: { x: 0, y: 0, z: 0 },
      time: 0,
      scale: 1,
      heightAt: () => 3,
      dt: 1 / 60,
    });
    expect(rig.position[1]).toBeGreaterThan(3);
  });
});

describe('dockPoseLeft (INT-3: the result panel does not hide the machine)', () => {
  /** 注視点を画面に投影したときの NDC の x */
  function ndcX(pose: ReturnType<typeof createPose>, point: number[], aspect: number): number {
    const p = pose.position;
    const f = pose.target.map((v, i) => v - p[i]!);
    const fl = Math.hypot(...f);
    const fwd = f.map((v) => v / fl);
    const u = pose.up;
    const r = [
      fwd[1]! * u[2] - fwd[2]! * u[1],
      fwd[2]! * u[0] - fwd[0]! * u[2],
      fwd[0]! * u[1] - fwd[1]! * u[0],
    ];
    const rl = Math.hypot(...r);
    const d = point.map((v, i) => v - p[i]!);
    const x = d.reduce((s, v, i) => s + (v * r[i]!) / rl, 0);
    const z = d.reduce((s, v, i) => s + v * fwd[i]!, 0);
    return x / z / (Math.tan((pose.fov * Math.PI) / 360) * aspect);
  }

  it('moves the machine to the centre of the part of the screen the panel leaves free', () => {
    const machine = [-6, 0.6, -14];
    const pose = createPose({ position: [-6.5, 1.55, -18.4], target: machine as never, fov: 42 });
    const ctx = { width: 1280, height: 720, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
    expect(ndcX(pose, machine, 1280 / 720)).toBeCloseTo(0, 9);
    dockPoseLeft(pose, ctx, 600);
    expect(ndcX(pose, machine, 1280 / 720)).toBeCloseTo(-600 / 1280, 6);
  });

  it('leaves narrow screens alone (the panel comes up from the bottom there)', () => {
    const pose = createPose({ position: [0, 1, 4], target: [0, 0.5, 0], fov: 42 });
    const before = JSON.stringify(pose);
    const ctx = {
      width: RESULT_DOCK_MIN_WIDTH - 1,
      height: 900,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    };
    dockPoseLeft(pose, ctx, 560);
    expect(JSON.stringify(pose)).toBe(before);
  });
});
