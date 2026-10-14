import { describe, expect, it } from 'vitest';
import { CameraPath, centripetalCatmullRom, createPose, lerpPose, poseDistance } from './pose';

const A = createPose({ position: [0, 2, 5], target: [0, 1, 0], fov: 50, ortho: 0 });
const V = createPose({ position: [2, 1.5, 1], target: [1, 1, -1], fov: 40, ortho: 0 });
const B = createPose({
  position: [1, 3, -1],
  target: [1, 1, -1],
  up: [0, 0, -1],
  fov: 30,
  ortho: 1,
});

describe('lerpPose', () => {
  it('両端で元の姿勢に一致する', () => {
    const out = createPose();
    expect(poseDistance(lerpPose(A, B, 0, out), A)).toBeLessThan(1e-12);
    expect(poseDistance(lerpPose(A, B, 1, out), B)).toBeLessThan(1e-12);
  });
  it('上方向は正規化される', () => {
    const out = lerpPose(A, B, 0.5, createPose());
    expect(Math.hypot(...out.up)).toBeCloseTo(1, 12);
  });
});

describe('centripetalCatmullRom', () => {
  it('区間の両端を通る', () => {
    expect(centripetalCatmullRom(0, 1, 3, 4, 1, 2, 1, 0)).toBeCloseTo(1, 12);
    expect(centripetalCatmullRom(0, 1, 3, 4, 1, 2, 1, 1)).toBeCloseTo(3, 12);
  });
  it('等間隔の直線上の点は直線上を等速で動く', () => {
    for (const t of [0.1, 0.25, 0.5, 0.9]) {
      expect(centripetalCatmullRom(0, 1, 2, 3, 1, 1, 1, t)).toBeCloseTo(1 + t, 9);
    }
  });
});

describe('CameraPath', () => {
  it('2 点なら線形補間', () => {
    const path = new CameraPath([A, B]);
    const out = createPose();
    const ref = createPose();
    for (const u of [0, 0.3, 0.7, 1]) {
      path.evaluate(u, out);
      lerpPose(A, B, u, ref);
      expect(poseDistance(out, ref)).toBeLessThan(1e-12);
    }
  });

  it('端点と経由点を通る', () => {
    const path = new CameraPath([A, V, B]);
    const out = createPose();
    expect(poseDistance(path.evaluate(0, out), A)).toBeLessThan(1e-12);
    expect(poseDistance(path.evaluate(1, out), B)).toBeLessThan(1e-12);
    // 経由点を通る u がどこかにある
    let best = Infinity;
    for (let i = 0; i <= 1000; i++)
      best = Math.min(best, poseDistance(path.evaluate(i / 1000, out), V));
    expect(best).toBeLessThan(0.01);
  });

  it('連続(小さな u の変化で大きく飛ばない)', () => {
    const path = new CameraPath([A, V, B]);
    const p = createPose();
    const q = createPose();
    for (let i = 0; i < 1000; i++) {
      path.evaluate(i / 1000, p);
      path.evaluate((i + 1) / 1000, q);
      expect(poseDistance(p, q)).toBeLessThan(0.05);
    }
  });

  it('平行投影の度合いは経由点の値をなぞり、最後だけ 1 へ上がる', () => {
    const path = new CameraPath([A, V, B]);
    const out = createPose();
    let lastOrtho = 0;
    for (let i = 0; i <= 100; i++) {
      path.evaluate(i / 100, out);
      expect(out.ortho).toBeGreaterThanOrEqual(lastOrtho - 1e-12);
      lastOrtho = out.ortho;
    }
    expect(lastOrtho).toBe(1);
  });

  it('行き先を差し替えると終点が追従する', () => {
    const path = new CameraPath([A, V, B]);
    const moved = createPose({ ...B, position: [1.2, 3, -1] });
    path.setEnd(moved);
    expect(poseDistance(path.evaluate(1, createPose()), moved)).toBeLessThan(1e-12);
  });
});
