import { describe, expect, it } from 'vitest';
import { jansenLeg, jansenWalker } from '@/core/model/presets';
import { buildMachineLayout } from '@/testrun/layout';
import { ROOM, WINDOW } from '../layout';
import { createPose, type CameraPose, type V3 } from '../rig/pose';
import { DEFAULT_STATION_CONTEXT, liveAnchors, resolveStation } from '../rig/stations';
import { assemblyCamera, createCameraScratch, decayOffset, goalCamera } from './camera';
import {
  bodyCenter,
  bodyPoseAt,
  createBodyPose,
  createCraneScratch,
  defaultPaperMapping,
  machineFrame,
  TRACK_LANDING,
  type CraneInput,
} from './crane';

function setup(design = jansenWalker()) {
  const layout = buildMachineLayout(design);
  const frame = machineFrame(
    layout,
    design.joints.flatMap((j) => [j.x, j.y]),
  );
  const crane: CraneInput = {
    paper: defaultPaperMapping(),
    frame,
    paperLift: 0,
    trackPosition: [TRACK_LANDING.x, 0.9, TRACK_LANDING.z],
    trackQuaternion: [0, 0, 0, 1],
  };
  liveAnchors.testMachine[0] = TRACK_LANDING.x;
  liveAnchors.testMachine[1] = 0.7;
  liveAnchors.testMachine[2] = TRACK_LANDING.z;
  const design0 = resolveStation('design', DEFAULT_STATION_CONTEXT);
  const track = resolveStation('testRun', DEFAULT_STATION_CONTEXT);
  return { crane, design0, track };
}

function expectPose(a: CameraPose, b: CameraPose, digits = 6) {
  a.position.forEach((v, i) => expect(v).toBeCloseTo(b.position[i]!, digits));
  a.target.forEach((v, i) => expect(v).toBeCloseTo(b.target[i]!, digits));
  expect(a.fov).toBeCloseTo(b.fov, digits);
  expect(a.ortho).toBeCloseTo(b.ortho, digits);
}

describe('assemblyCamera', () => {
  const sc = createCameraScratch();
  it('starts at the design station and ends at the test-run station', () => {
    const { crane, design0, track } = setup();
    expectPose(assemblyCamera(0, design0, track, crane, sc, createPose()), design0);
    expectPose(assemblyCamera(1, design0, track, crane, sc, createPose()), track);
  });

  it('watches the machine standing on the paper in perspective', () => {
    const { crane, design0, track } = setup();
    const p = assemblyCamera(0.3, design0, track, crane, sc, createPose());
    expect(p.ortho).toBe(0);
    expect(p.position[1]).toBeGreaterThan(p.target[1]);
    // 作業台の手前側(部屋の中)から
    expect(p.position[2]).toBeGreaterThan(p.target[2]);
  });

  it('moves smoothly and only leaves the room through the window', () => {
    for (const design of [jansenWalker(), jansenLeg()]) {
      const { crane, design0, track } = setup(design);
      const p = createPose();
      let prev = assemblyCamera(0, design0, track, crane, sc, createPose()).position.slice();
      let crossed = false;
      for (let u = 0; u <= 1.00001; u += 0.0005) {
        assemblyCamera(u, design0, track, crane, sc, p);
        const [x, y, z] = p.position;
        expect(Math.hypot(x - prev[0]!, y - prev[1]!, z - prev[2]!)).toBeLessThan(0.08);
        prev = [x, y, z];
        if (z > ROOM.zBack + 0.12) {
          // 部屋の中
          expect(x).toBeGreaterThan(ROOM.xMin);
          expect(x).toBeLessThan(ROOM.xMax);
          expect(y).toBeGreaterThan(0.2);
          expect(y).toBeLessThan(ROOM.height);
        } else if (z > ROOM.zBack - 0.12) {
          // 壁の厚みの中:窓の開口を通る
          crossed = true;
          expect(x).toBeGreaterThan(WINDOW.xMin + 0.05);
          expect(x).toBeLessThan(WINDOW.xMax - 0.05);
          expect(y).toBeGreaterThan(WINDOW.yMin + 0.05);
          expect(y).toBeLessThan(WINDOW.yMax - 0.05);
        }
      }
      expect(crossed).toBe(true);
    }
  });
});

describe('assemblyCamera from the result station (T-05)', () => {
  const sc = createCameraScratch();
  it('goes round the machine instead of through it', () => {
    const { crane, design0 } = setup();
    const result = resolveStation('result', DEFAULT_STATION_CONTEXT);
    const p = createPose();
    const centre: V3 = [0, 0, 0];
    const cs = createCraneScratch();
    const body = createBodyPose();
    expectPose(assemblyCamera(1, design0, result, crane, sc, createPose()), result);
    for (let u = 1; u >= 0.7; u -= 0.002) {
      assemblyCamera(u, design0, result, crane, sc, p);
      bodyCenter(bodyPoseAt(u, crane, cs, body), crane.frame, [0, 0, 0], centre);
      const d = Math.hypot(
        p.position[0] - centre[0],
        p.position[1] - centre[1],
        p.position[2] - centre[2],
      );
      // 機械の大きさ(外接箱の対角の半分 × 縮尺)の 2 倍より近づかない
      expect(d).toBeGreaterThan(2 * crane.frame.radius * body.scale);
    }
  });
});

describe('goalCamera', () => {
  it('orbits half way round the machine from the test-run to the result station', () => {
    liveAnchors.testMachine[0] = 2;
    liveAnchors.testMachine[1] = 0.7;
    liveAnchors.testMachine[2] = -14;
    const start = resolveStation('testRun', DEFAULT_STATION_CONTEXT);
    const end = resolveStation('result', DEFAULT_STATION_CONTEXT);
    expectPose(goalCamera(0, start, end, createPose()), start);
    expectPose(goalCamera(1, start, end, createPose()), end);
    const mid = goalCamera(0.5, start, end, createPose());
    const c = end.target;
    const r0 = Math.hypot(start.position[0] - c[0], start.position[2] - c[2]);
    const rm = Math.hypot(mid.position[0] - c[0], mid.position[2] - c[2]);
    expect(rm).toBeCloseTo(r0, 6);
    // 半周の真ん中:始めと終わりのどちらからも 90° 回った所
    const ang = (p: CameraPose) => Math.atan2(p.position[0] - c[0], p.position[2] - c[2]);
    const d = Math.abs(Math.cos(ang(mid) - ang(start)));
    expect(d).toBeLessThan(1e-6);
  });
});

describe('decayOffset', () => {
  it('is a no-op when the camera already was on the effect path', () => {
    const fx = createPose({ position: [1, 2, 3], target: [0, 1, 0], fov: 40 });
    const s = createPose({ position: [4, 4, 4], target: [0, 0, 0], fov: 50 });
    expectPose(decayOffset(fx, s, s, 0, createPose()), fx);
  });
  it('starts at the actual camera and blends the offset away', () => {
    const fx = createPose({ position: [1, 2, 3], target: [0, 1, 0], fov: 40 });
    const fx0 = createPose({ position: [0, 2, 3], target: [0, 1, 0], fov: 40 });
    const s = createPose({ position: [0, 3, 3], target: [0, 1, 0], fov: 40 });
    const a = decayOffset(fx, s, fx0, 0, createPose());
    expect(a.position[1]).toBeCloseTo(3);
    const b = decayOffset(fx, s, fx0, 1, createPose());
    expectPose(b, fx);
  });
});
