import { describe, expect, it } from 'vitest';
import { CM } from '@/core/model/types';
import { jansenLeg, jansenWalker } from '@/core/model/presets';
import { buildMachineLayout } from '@/testrun/layout';
import { BENCH, ROOM, WINDOW } from '../layout';
import type { V3 } from '../rig/pose';
import {
  bodyCenter,
  bodyPoseAt,
  createBodyPose,
  createCraneScratch,
  defaultPaperMapping,
  machineFrame,
  machineScaleAt,
  paperBodyPosition,
  paperScale,
  rotate,
  swayAngle,
  TRACK_LANDING,
  type CraneInput,
  type Q4,
} from './crane';
import { ASSEMBLY_PHASES } from './timeline';

function setup(design = jansenWalker(), q: Q4 = [0, 0, 0, 1]) {
  const layout = buildMachineLayout(design);
  const pos = design.joints.flatMap((j) => [j.x, j.y]);
  const frame = machineFrame(layout, pos);
  const input: CraneInput = {
    paper: defaultPaperMapping(),
    frame,
    paperLift: 0,
    trackPosition: [TRACK_LANDING.x, 0.9, TRACK_LANDING.z],
    trackQuaternion: q,
  };
  return { layout, frame, input, pos };
}

describe('paper placement', () => {
  it('stands the drawn leg on its lowest line, where the drawing is', () => {
    const { frame, input, pos } = setup(jansenLeg());
    const s = paperScale(input.paper);
    const B = paperBodyPosition(input.paper, frame.hingeY, 0, [0, 0, 0]);
    // 最も低いジョイント
    let low = 1;
    for (let j = 3; j < pos.length; j += 2) if (pos[j]! < pos[low]!) low = j;
    const xCm = pos[low - 1]!;
    const yCm = pos[low]!;
    const world: V3 = [B[0] + s * xCm * CM, B[1] + s * yCm * CM, B[2]];
    const m = input.paper;
    expect(world[0]).toBeCloseTo(m.origin[0] + xCm * m.metersPerCm, 9);
    expect(world[1]).toBeCloseTo(m.origin[1], 9);
    // 立てた脚の z = 図面の上での、最も低い点の z
    expect(world[2]).toBeCloseTo(m.origin[2] - yCm * m.metersPerCm, 9);
    expect(m.origin[1]).toBeGreaterThan(BENCH.top);
  });
});

describe('bodyPoseAt', () => {
  const sc = createCraneScratch();
  it('starts standing on the paper at the drawing scale', () => {
    const { frame, input } = setup();
    const p = bodyPoseAt(0, input, sc, createBodyPose());
    const B = paperBodyPosition(input.paper, frame.hingeY, 0, [0, 0, 0]);
    expect(p.scale).toBeCloseTo(paperScale(input.paper), 9);
    p.position.forEach((v, i) => expect(v).toBeCloseTo(B[i]!, 9));
    expect(p.quaternion[3]).toBeCloseTo(1, 9);
    // 組み上げの間は動かない
    const q = bodyPoseAt(ASSEMBLY_PHASES.carry.start, input, sc, createBodyPose());
    q.position.forEach((v, i) => expect(v).toBeCloseTo(B[i]!, 9));
  });

  it('lands exactly on the test-run pose at full scale', () => {
    const tilt: Q4 = [0, 0, Math.sin(0.05), Math.cos(0.05)];
    const { input } = setup(jansenWalker(), tilt);
    for (const u of [ASSEMBLY_PHASES.lower.end, 0.97, 1]) {
      const p = bodyPoseAt(u, input, sc, createBodyPose());
      expect(p.scale).toBe(1);
      p.position.forEach((v, i) => expect(v).toBeCloseTo(input.trackPosition[i]!, 9));
      p.quaternion.forEach((v, i) => expect(v).toBeCloseTo(tilt[i]!, 9));
    }
  });

  it('moves continuously', () => {
    const { input } = setup();
    let prev = bodyPoseAt(0, input, sc, createBodyPose());
    const prevPos = [...prev.position];
    for (let u = 0; u <= 1.0001; u += 0.001) {
      const p = bodyPoseAt(u, input, sc, createBodyPose());
      const jump = Math.hypot(
        p.position[0] - prevPos[0]!,
        p.position[1] - prevPos[1]!,
        p.position[2] - prevPos[2]!,
      );
      // 跳ばない:一番速いところでも 1/1000 の進行で 15cm 未満
      expect(jump).toBeLessThan(0.15);
      prevPos.splice(0, 3, ...p.position);
      prev = p;
    }
    expect(prev.scale).toBe(1);
  });

  it('carries the machine through the window opening, not the wall', () => {
    for (const design of [jansenWalker(), jansenLeg()]) {
      const { frame, input, layout } = setup(design);
      const e = layout.extent;
      const center: V3 = [0, 0, 0];
      const tmp: V3 = [0, 0, 0];
      let crossed = 0;
      let prevZ = Infinity;
      for (let u = ASSEMBLY_PHASES.carry.start; u <= ASSEMBLY_PHASES.carry.end; u += 0.0005) {
        const p = bodyPoseAt(u, input, sc, createBodyPose());
        bodyCenter(p, frame, tmp, center);
        const s = p.scale;
        const hx = (s * (e.xMax - e.xMin)) / 2;
        const hy = (s * (e.yMax - e.yMin)) / 2;
        const hz = (s * (e.zMax - e.zMin)) / 2;
        // 壁の厚み(0.2m)に機体のどこかが入っている間
        if (center[2] - hz < ROOM.zBack + 0.1 && center[2] + hz > ROOM.zBack - 0.1) {
          crossed++;
          expect(center[0] - hx).toBeGreaterThan(WINDOW.xMin);
          expect(center[0] + hx).toBeLessThan(WINDOW.xMax);
          expect(center[1] - hy).toBeGreaterThan(WINDOW.yMin);
          expect(center[1] + hy).toBeLessThan(WINDOW.yMax);
        }
        // 窓のほうへ進むだけ(持ち上げの膨らみと揺れの分は許す)
        expect(center[2]).toBeLessThanOrEqual(prevZ + 0.1);
        prevZ = Math.min(prevZ, center[2]);
      }
      expect(crossed).toBeGreaterThan(0);
    }
  });

  it('grows to full size only after leaving the room', () => {
    const { input } = setup();
    const s0 = paperScale(input.paper);
    const p = bodyPoseAt(ASSEMBLY_PHASES.grow.start, input, sc, createBodyPose());
    expect(p.position[2]).toBeLessThan(WINDOW.z - 0.3);
    expect(machineScaleAt(ASSEMBLY_PHASES.grow.start, input.paper)).toBeCloseTo(s0, 9);
    expect(machineScaleAt(ASSEMBLY_PHASES.grow.end, input.paper)).toBeCloseTo(1, 9);
  });
});

describe('swayAngle', () => {
  it('rests before and after the trip', () => {
    expect(swayAngle(0)).toBe(0);
    expect(swayAngle(ASSEMBLY_PHASES.carry.start)).toBe(0);
    expect(swayAngle(1)).toBe(0);
    expect(Math.abs(swayAngle(0.6))).toBeGreaterThan(0);
  });
});

describe('rotate', () => {
  it('rotates a vector by a quaternion', () => {
    const q: Q4 = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)]; // y 回り 90°
    const v = rotate(q, [1, 0, 0], [0, 0, 0]);
    expect(v[0]).toBeCloseTo(0);
    expect(v[2]).toBeCloseTo(-1);
  });
});
