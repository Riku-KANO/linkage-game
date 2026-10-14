import { describe, expect, it } from 'vitest';
import { COURSE_MODEL } from '../layout';
import { createPose } from '../rig/pose';
import { buildDioramaLayout, createRouteSample, markerOf, sampleRoute } from './diorama';
import { closeUpPose, T06_WALK, t06WalkEnd, t06WalkProgress } from './t06';

describe('T-06 の時間割', () => {
  const D = 2;
  it('カメラが模型に近づくまでは止まっていて、着いた後に次の目印に着く', () => {
    expect(t06WalkProgress(0, D)).toBe(0);
    expect(t06WalkProgress(T06_WALK.start * D, D)).toBe(0);
    // カメラが着いた瞬間(遷移の終わり)はまだ歩いている
    const atArrival = t06WalkProgress(D, D);
    expect(atArrival).toBeGreaterThan(0);
    expect(atArrival).toBeLessThan(1);
    expect(t06WalkProgress(t06WalkEnd(D), D)).toBe(1);
    expect(t06WalkProgress(t06WalkEnd(D) + 5, D)).toBe(1);
    expect(t06WalkProgress(-1, D)).toBe(0);
  });

  it('2 回目以降の短縮版(1.0 秒)は同じ割合で短い', () => {
    expect(t06WalkEnd(1)).toBeCloseTo(t06WalkEnd(2) / 2, 12);
    expect(t06WalkProgress(0.9, 1)).toBeCloseTo(t06WalkProgress(1.8, 2), 12);
  });

  it('遷移の長さが 0 なら歩かずに着いている', () => {
    expect(t06WalkProgress(0, 0)).toBe(1);
    expect(t06WalkEnd(0)).toBe(0);
  });

  it('単調に進み、歩き出しと着く前はゆっくり', () => {
    let prev = 0;
    for (let k = 0; k <= 100; k++) {
      const v = t06WalkProgress((k / 100) * t06WalkEnd(D), D);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    const a = T06_WALK.start * D;
    const b = t06WalkEnd(D);
    const slope = (t: number) => (t06WalkProgress(t + 0.01, D) - t06WalkProgress(t, D)) / 0.01;
    const mid = (a + b) / 2;
    expect(slope(a + 0.001)).toBeLessThan(slope(mid));
    expect(slope(b - 0.011)).toBeLessThan(slope(mid));
  });
});

describe('歩く機械に寄るカメラ', () => {
  const layout = buildDioramaLayout();
  const at = (id: string): [number, number, number] => {
    const p = sampleRoute(layout.route, markerOf(layout, id)!.s, createRouteSample());
    return [p.x, p.y, p.z];
  };

  it('模型の手前の上から、歩く区間の真ん中付近を見下ろす(部屋の中)', () => {
    const pose = closeUpPose(at('c1-s1'), at('c1-s2'), 16 / 9, createPose());
    for (const v of [...pose.position, ...pose.target, pose.fov])
      expect(Number.isFinite(v)).toBe(true);
    expect(pose.position[2]).toBeGreaterThan(pose.target[2] + 0.2);
    expect(pose.position[1]).toBeGreaterThan(pose.target[1] + 0.2);
    expect(pose.position[2]).toBeLessThan(0);
    expect(pose.target[2]).toBeGreaterThan(COURSE_MODEL.center[2] - COURSE_MODEL.depth);
    expect(pose.ortho).toBe(0);
  });

  it('長い区間(章をまたぐ)ほど引いて見る', () => {
    const d = (a: string, b: string) => {
      const p = closeUpPose(at(a), at(b), 16 / 9, createPose());
      return Math.hypot(
        p.position[0] - p.target[0],
        p.position[1] - p.target[1],
        p.position[2] - p.target[2],
      );
    };
    expect(d('c1-s5', 'c2-s1')).toBeGreaterThan(d('c1-s1', 'c1-s2'));
  });

  it('縦長の画面では画角を広げて横の見える範囲を保つ', () => {
    const wide = closeUpPose(at('c1-s1'), at('c1-s2'), 16 / 9, createPose());
    const tall = closeUpPose(at('c1-s1'), at('c1-s2'), 9 / 16, createPose());
    expect(tall.fov).toBeGreaterThan(wide.fov);
  });
});
