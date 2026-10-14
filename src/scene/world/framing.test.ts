import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createPose, type CameraPose } from '../rig/pose';
import {
  buildDioramaLayout,
  createRouteSample,
  dioramaToWorld,
  markerOf,
  sampleRoute,
} from './diorama';
import { COURSE_MODEL } from '../layout';
import { closeUpPose, freeRegion, overviewPose, playableBounds, STAGE_PANEL } from './framing';

const layout = buildDioramaLayout();

/** 姿勢から見たワールドの点の画面上の位置(px) */
function project(pose: CameraPose, w: number, h: number, p: readonly number[]) {
  const cam = new PerspectiveCamera(pose.fov, w / h, 0.01, 100);
  cam.position.set(...(pose.position as [number, number, number]));
  cam.up.set(...(pose.up as [number, number, number]));
  cam.lookAt(new Vector3(...(pose.target as [number, number, number])));
  cam.updateMatrixWorld();
  const v = new Vector3(p[0], p[1], p[2]).project(cam);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z };
}

/** 遊べる章の台地の外周(ワールド) */
function plateauRims(): number[][] {
  const out: number[][] = [];
  for (const p of layout.plateaus.filter((q) => q.playable)) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (const y of [0, p.top]) {
        const w: [number, number, number] = [0, 0, 0];
        dioramaToWorld(COURSE_MODEL.center, p.x + Math.cos(a) * p.r, y, p.z + Math.sin(a) * p.r, w);
        out.push(w);
      }
    }
  }
  return out;
}

describe('パネルに隠れない範囲', () => {
  it('1280 幅ではパネル(右 624px)と隙間を除いた左側', () => {
    const r = freeRegion(1280);
    expect(r.x0).toBe(0);
    expect(r.x1 * 1280).toBeCloseTo(
      1280 - STAGE_PANEL.maxWidth - STAGE_PANEL.right - STAGE_PANEL.gap,
      6,
    );
  });

  it('狭い画面ではパネルを避けきれないので全幅', () => {
    expect(freeRegion(700)).toEqual({ x0: 0, x1: 1 });
  });
});

describe('ステージ選択の全体の構図', () => {
  for (const [w, h] of [
    [1280, 720],
    [1920, 1080],
    [1600, 900],
  ] as const) {
    it(`${w}×${h}:遊べる章の台地がパネルに隠れない左側に収まり、余白を残して大きく映る`, () => {
      const pose = overviewPose(layout, w, h, createPose());
      const free = freeRegion(w).x1 * w;
      const pts = plateauRims().map((p) => project(pose, w, h, p));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      expect(Math.min(...xs)).toBeGreaterThan(0);
      expect(Math.max(...xs)).toBeLessThan(free);
      expect(Math.min(...ys)).toBeGreaterThan(0);
      expect(Math.max(...ys)).toBeLessThan(h);
      // 範囲の 7 割以上を使う
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(free * 0.7);
      // 模型の手前の上から見下ろす(部屋の中)
      expect(pose.position[2]).toBeGreaterThan(pose.target[2]);
      expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
      expect(pose.position[2]).toBeLessThan(4);
    });
  }

  it('遊べる章の台地を囲む箱は章 1・2 の範囲', () => {
    const b = playableBounds(layout);
    expect(b.width).toBeGreaterThan(1);
    expect(b.center[0]).toBeLessThan(COURSE_MODEL.center[0]);
  });
});

describe('T-06 の歩く区間に寄る構図', () => {
  const at = (id: string): [number, number, number] => {
    const p = sampleRoute(layout.route, markerOf(layout, id)!.s, createRouteSample());
    return [p.x, p.y, p.z];
  };
  const world = (p: [number, number, number]) => {
    const w: [number, number, number] = [0, 0, 0];
    return dioramaToWorld(COURSE_MODEL.center, p[0], p[1], p[2], w);
  };

  for (const [a, b] of [
    ['c1-s1', 'c1-s2'],
    ['c1-s5', 'c2-s1'],
    ['c2-s3', 'c2-s4'],
  ] as const) {
    it(`${a} → ${b}:両端がパネルに隠れない左側に収まる`, () => {
      const pose = closeUpPose(at(a), at(b), 1280, 720, createPose());
      const free = freeRegion(1280).x1 * 1280;
      for (const p of [world(at(a)), world(at(b))]) {
        const s = project(pose, 1280, 720, p);
        expect(s.x).toBeGreaterThan(20);
        expect(s.x).toBeLessThan(free - 20);
        expect(s.y).toBeGreaterThan(20);
        expect(s.y).toBeLessThan(700);
      }
    });
  }

  it('長い区間(章をまたぐ)ほど引いて見る', () => {
    const d = (a: string, b: string) => {
      const p = closeUpPose(at(a), at(b), 1280, 720, createPose());
      return Math.hypot(
        p.position[0] - p.target[0],
        p.position[1] - p.target[1],
        p.position[2] - p.target[2],
      );
    };
    expect(d('c1-s5', 'c2-s1')).toBeGreaterThan(d('c1-s1', 'c1-s2'));
  });

  it('縦長の画面では画角を広げる', () => {
    const wide = closeUpPose(at('c1-s1'), at('c1-s2'), 1280, 720, createPose());
    const tall = closeUpPose(at('c1-s1'), at('c1-s2'), 720, 1280, createPose());
    expect(tall.fov).toBeGreaterThan(wide.fov);
  });
});
