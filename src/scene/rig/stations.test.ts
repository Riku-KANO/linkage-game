import { afterEach, describe, expect, it } from 'vitest';
import type { Screen } from '@/ui/tokens';
import { TRANSITIONS } from '@/ui/tokens';
import { BENCH, ROOM, WINDOW } from '../layout';
import { createPose, poseDistance, type CameraPath, type CameraPose } from './pose';
import {
  DEFAULT_STATION_CONTEXT as CTX,
  buildTransitionPath,
  resolveStation,
  setStationOverride,
  viaPoses,
} from './stations';

const SCREENS: Screen[] = [
  'boot',
  'home',
  'stageSelect',
  'design',
  'testRun',
  'result',
  'zukan',
  'settings',
  'sandbox',
];

const WALL_IN = ROOM.zBack + ROOM.wallThickness / 2;
const WALL_OUT = ROOM.zBack - ROOM.wallThickness / 2;

/** 経路を細かくたどり、壁・床・天井・作業台を突き抜けないか調べる */
function assertPathClear(path: CameraPath, label: string) {
  const p = createPose();
  for (let i = 0; i <= 2000; i++) {
    path.evaluate(i / 2000, p);
    const [x, y, z] = p.position;
    const where = `${label} u=${i / 2000} pos=(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
    expect(Number.isFinite(x + y + z), where).toBe(true);
    if (z >= WALL_OUT - 0.05 && z <= WALL_IN + 0.05) {
      // 奥の壁を通るのは窓からだけ
      expect(x > WINDOW.xMin + 0.15 && x < WINDOW.xMax - 0.15, `窓の幅の外: ${where}`).toBe(true);
      expect(y > WINDOW.yMin + 0.15 && y < WINDOW.yMax - 0.15, `窓の高さの外: ${where}`).toBe(true);
    } else if (z > WALL_IN) {
      // 屋内:床・天井・左右の壁の内側
      expect(y > 0.15 && y < ROOM.height - 0.15, `床・天井: ${where}`).toBe(true);
      expect(x > ROOM.xMin + 0.15 && x < ROOM.xMax - 0.15, `左右の壁: ${where}`).toBe(true);
      // 作業台の天板より下に潜らない
      const overBench =
        Math.abs(x - BENCH.center[0]) < BENCH.width / 2 + 0.1 &&
        Math.abs(z - BENCH.center[2]) < BENCH.depth / 2 + 0.1;
      if (overBench) expect(y > BENCH.top + 0.25, `作業台: ${where}`).toBe(true);
    } else {
      expect(y > 0.3, `屋外の地面: ${where}`).toBe(true);
    }
  }
}

afterEach(() => setStationOverride('home', null));

describe('定位置', () => {
  it('全画面に有限の定位置がある。設計画面だけが真上からの平行投影', () => {
    for (const s of SCREENS) {
      const pose = resolveStation(s, CTX);
      for (const v of [...pose.position, ...pose.target, pose.fov]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      if (s === 'design') {
        expect(pose.ortho).toBe(1);
        expect(pose.up).toEqual([0, 0, -1]);
        expect(pose.position[0]).toBeCloseTo(pose.target[0], 9);
        expect(pose.position[2]).toBeCloseTo(pose.target[2], 9);
        expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
      } else {
        expect(pose.ortho).toBe(0);
      }
    }
  });

  it('縦長の画面では画角を広げて横の見える範囲を保つ', () => {
    const wide = resolveStation('home', { ...CTX, width: 1600, height: 900 });
    const tall = resolveStation('home', { ...CTX, width: 900, height: 1200 });
    expect(tall.fov).toBeGreaterThan(wide.fov);
  });

  it('上書きできる', () => {
    setStationOverride('home', (base) => ({ ...base, fov: 10 }));
    expect(resolveStation('home', CTX).fov).toBe(10);
    setStationOverride('home', null);
    expect(resolveStation('home', CTX).fov).not.toBe(10);
  });
});

describe('遷移の経由点', () => {
  it('T-02 / T-07 は作業台の手前を経由して真上へ回り込む', () => {
    expect(viaPoses('stageSelect', 'design', CTX)).toHaveLength(1);
    expect(viaPoses('home', 'design', CTX)).toHaveLength(1);
  });

  it('設計 → 試走は紙から立ち上がり、窓を通って外へ出る', () => {
    const v = viaPoses('design', 'testRun', CTX);
    expect(v).toHaveLength(3);
    expect(v[1]!.position[2]).toBeGreaterThan(WINDOW.z);
    expect(v[2]!.position[2]).toBeLessThan(WINDOW.z);
  });

  it('試走 → 結果は機械の周りを半周する', () => {
    const v = viaPoses('testRun', 'result', CTX);
    expect(v.length).toBeGreaterThanOrEqual(3);
  });

  it('逆向きの遷移は同じ経由点を逆順にたどる', () => {
    for (const token of TRANSITIONS) {
      const fwd = viaPoses(token.from, token.to, CTX);
      const rev = viaPoses(token.to, token.from, CTX);
      expect(rev.length).toBe(fwd.length);
      fwd.forEach((p, i) => {
        expect(poseDistance(p, rev[rev.length - 1 - i]!)).toBeLessThan(1e-9);
      });
    }
  });
});

describe('カメラ経路は工房を突き抜けない', () => {
  it('落ち着いた定位置から、全ての画面の組み合わせ', () => {
    for (const from of SCREENS) {
      for (const to of SCREENS) {
        if (from === to) continue;
        const path = buildTransitionPath(resolveStation(from, CTX), from, to, CTX);
        assertPathClear(path, `${from}→${to}`);
      }
    }
  });

  it('遷移の途中から割り込まれても(戻る・別の画面へ)', () => {
    const p = createPose();
    for (const [from, to] of [
      ['design', 'testRun'],
      ['testRun', 'design'],
      ['home', 'design'],
      ['result', 'stageSelect'],
      ['home', 'zukan'],
    ] as const) {
      const first = buildTransitionPath(resolveStation(from, CTX), from, to, CTX);
      for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        first.evaluate(u, p);
        const start: CameraPose = {
          ...p,
          position: [...p.position],
          target: [...p.target],
          up: [...p.up],
        };
        for (const next of SCREENS) {
          if (next === to) continue;
          const path = buildTransitionPath(start, to, next, CTX);
          assertPathClear(path, `${from}→${to}@${u}→${next}`);
        }
      }
    }
  });
});
