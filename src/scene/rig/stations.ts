import type { Screen } from '@/ui/tokens';
import {
  BENCH,
  COURSE_MODEL,
  LOGO_SIGN,
  PAPER_WORLD,
  SHELF,
  TEST_TRACK,
  TOOLBOX,
  WINDOW_CENTER,
  type P3,
} from '../layout';
import { DEFAULT_PAPER_INSETS, designStationPose, type Insets } from './paper';
import { CameraPath, copyPose, createPose, poseDistance, type CameraPose, type V3 } from './pose';

/**
 * カメラの定位置(画面ごと)と、遷移の経由点。
 * 定位置は画面サイズに合わせて毎フレーム求め直す(設計画面は紙が画面に収まるように、
 * 他は縦長の画面でも横の見える範囲が狭くなりすぎないように画角を広げる)。
 */

export interface StationContext {
  width: number;
  height: number;
  /** 設計画面で紙の周りに空ける余白(CSS px) */
  insets: Insets;
}

interface StationSpec {
  position: P3;
  target: P3;
  fov: number;
  /** 最低限確保する横の画角(度)。縦長の画面では縦の画角を広げる */
  minHFov?: number;
}

/** 動く被写体の現在位置(試走の機械など)。描画側が毎フレーム書き込む */
export const liveAnchors = {
  testMachine: [TEST_TRACK.xStart, 0.6, TEST_TRACK.z] as V3,
};

const STATIC: Record<Exclude<Screen, 'design' | 'testRun' | 'result'>, StationSpec> = {
  boot: {
    position: [LOGO_SIGN.center[0], LOGO_SIGN.center[1] - 0.05, LOGO_SIGN.center[2] + 1.85],
    target: [LOGO_SIGN.center[0], LOGO_SIGN.center[1], LOGO_SIGN.center[2]],
    fov: 36,
    minHFov: 62,
  },
  home: { position: [0.55, 2.45, 4.3], target: [0.15, 1.05, -1.0], fov: 42, minHFov: 70 },
  stageSelect: {
    position: [COURSE_MODEL.center[0], 2.08, COURSE_MODEL.center[2] + 1.5],
    target: [COURSE_MODEL.center[0], COURSE_MODEL.center[1] + 0.02, COURSE_MODEL.center[2] + 0.05],
    fov: 40,
    minHFov: 66,
  },
  zukan: {
    position: [SHELF.center[0] - 1.55, 1.3, SHELF.center[2] + 0.1],
    target: [SHELF.center[0] - 0.1, 1.05, SHELF.center[2] + 0.1],
    fov: 46,
    minHFov: 60,
  },
  settings: {
    position: [TOOLBOX.center[0] + 0.45, 0.98, TOOLBOX.center[2] + 0.95],
    target: [TOOLBOX.center[0], 0.2, TOOLBOX.center[2]],
    fov: 40,
    minHFov: 56,
  },
  sandbox: {
    position: [WINDOW_CENTER[0] + 0.3, 1.55, WINDOW_CENTER[2] + 1.1],
    target: [WINDOW_CENTER[0] - 0.8, 1.0, -14],
    fov: 48,
    minHFov: 70,
  },
};

/** 経由点(遷移の途中で通る姿勢) */
export type ViaKey = 'benchApproach' | 'riseFromPaper' | 'windowInside' | 'windowOutside';

const VIAS: Record<ViaKey, StationSpec> = {
  // 作業台の手前から紙を斜めに見下ろす(T-02 / T-07 の回り込みの起点)
  benchApproach: {
    position: [PAPER_WORLD.center[0], 1.75, BENCH.center[2] + 1.35],
    target: [PAPER_WORLD.center[0], BENCH.top, PAPER_WORLD.center[2]],
    fov: 38,
  },
  // 紙から立ち上がって窓のほうを向く(設計 → 試走)
  riseFromPaper: {
    position: [-0.95, 1.8, -1.6],
    target: [WINDOW_CENTER[0], 1.45, -3.6],
    fov: 45,
  },
  windowInside: {
    position: [WINDOW_CENTER[0], WINDOW_CENTER[1], WINDOW_CENTER[2] + 0.75],
    target: [WINDOW_CENTER[0] - 0.4, 1.1, -10],
    fov: 48,
  },
  windowOutside: {
    position: [WINDOW_CENTER[0], WINDOW_CENTER[1], WINDOW_CENTER[2] - 0.9],
    target: [WINDOW_CENTER[0] - 1.5, 0.8, TEST_TRACK.z],
    fov: 46,
  },
};

const OUTDOOR: ReadonlySet<Screen> = new Set<Screen>(['testRun', 'result']);

/** 試走 → 結果で機械の周りを回る半径・高さ・角度(rad。0 = 機械の +z 側) */
const ORBIT = { radius: 4.6, height: 1.55, testRunAngle: -0.32, resultAngle: Math.PI - 0.32 };

function fitFov(fov: number, minHFov: number | undefined, aspect: number): number {
  if (!minHFov) return fov;
  const needed = (Math.atan(Math.tan((minHFov * Math.PI) / 360) / aspect) * 360) / Math.PI;
  return Math.max(fov, needed);
}

function setPose(out: CameraPose, spec: StationSpec, aspect: number): CameraPose {
  out.position[0] = spec.position[0];
  out.position[1] = spec.position[1];
  out.position[2] = spec.position[2];
  out.target[0] = spec.target[0];
  out.target[1] = spec.target[1];
  out.target[2] = spec.target[2];
  out.up[0] = 0;
  out.up[1] = 1;
  out.up[2] = 0;
  out.fov = fitFov(spec.fov, spec.minHFov, aspect);
  out.ortho = 0;
  return out;
}

function orbitPose(angle: number, aspect: number, out: CameraPose): CameraPose {
  const [mx, my, mz] = liveAnchors.testMachine;
  return setPose(
    out,
    {
      position: [
        mx + 0.6 + ORBIT.radius * Math.sin(angle),
        ORBIT.height,
        mz + ORBIT.radius * Math.cos(angle),
      ],
      target: [mx + 0.6, Math.max(0.4, my - 0.05), mz],
      fov: 42,
      minHFov: 66,
    },
    aspect,
  );
}

/** 画面の定位置(上書きがなければ既定) */
export function baseStation(
  screen: Screen,
  ctx: StationContext,
  out: CameraPose = createPose(),
): CameraPose {
  const aspect = Math.max(0.1, ctx.width / Math.max(1, ctx.height));
  switch (screen) {
    case 'design':
      return designStationPose(ctx.width, ctx.height, ctx.insets, out);
    case 'testRun':
      return orbitPose(ORBIT.testRunAngle, aspect, out);
    case 'result':
      return orbitPose(ORBIT.resultAngle, aspect, out);
    default:
      return setPose(out, STATIC[screen], aspect);
  }
}

export type StationOverride = (base: CameraPose, ctx: StationContext) => CameraPose | null;
const overrides = new Map<Screen, StationOverride>();

/**
 * 画面の定位置を差し替える(例:試走ストリームが機械をばね付きで追うカメラを入れる)。
 * 関数は既定の姿勢を受け取り、新しい姿勢(または null で既定のまま)を返す。解除は null。
 */
export function setStationOverride(screen: Screen, fn: StationOverride | null): void {
  if (fn) overrides.set(screen, fn);
  else overrides.delete(screen);
}

export function resolveStation(
  screen: Screen,
  ctx: StationContext,
  out: CameraPose = createPose(),
): CameraPose {
  baseStation(screen, ctx, out);
  const o = overrides.get(screen);
  if (!o) return out;
  const r = o(out, ctx);
  return r && r !== out ? copyPose(r, out) : out;
}

/** カメラ位置が屋外(奥の壁より外)か */
export function isOutdoorPosition(p: V3): boolean {
  return p[2] < WINDOW_CENTER[2] - 0.05;
}

export interface ViaOptions {
  /** 遷移の開始時、カメラが元の画面の定位置に落ち着いていたか(途中からの割り込みなら false) */
  settled: boolean;
  /** 開始時のカメラが屋外にあるか */
  outdoor: boolean;
}

/**
 * 遷移の経由点。工房の中の配置から決まる:
 * 紙から離れる・紙に降りるときは回り込みの経由点、屋内と屋外の行き来は窓を通る、
 * 試走 → 結果は機械の周りを半周する。逆向きの遷移では同じ点を逆順にたどる。
 * 途中からの割り込みでは、今いる場所(屋内・屋外)から行き先までに必要な点だけを通る。
 */
export function viaPoses(
  from: Screen,
  to: Screen,
  ctx: StationContext,
  opts: ViaOptions = { settled: true, outdoor: OUTDOOR.has(from) },
): CameraPose[] {
  const aspect = Math.max(0.1, ctx.width / Math.max(1, ctx.height));
  const keys: ViaKey[] = [];
  const fromOut = opts.outdoor;
  const toOut = OUTDOOR.has(to);
  if (opts.settled && from === 'design' && to !== 'design') {
    keys.push(toOut ? 'riseFromPaper' : 'benchApproach');
  }
  if (fromOut && !toOut) keys.push('windowOutside', 'windowInside');
  if (!fromOut && toOut) keys.push('windowInside', 'windowOutside');
  if (to === 'design' && from !== 'design' && (opts.settled || fromOut)) {
    keys.push(fromOut ? 'riseFromPaper' : 'benchApproach');
  }
  const poses = keys.map((k) => setPose(createPose(), VIAS[k], aspect));
  if (opts.settled && OUTDOOR.has(from) && toOut && from !== to) {
    const a0 = from === 'testRun' ? ORBIT.testRunAngle : ORBIT.resultAngle;
    const a1 = from === 'testRun' ? ORBIT.resultAngle : ORBIT.testRunAngle;
    for (const f of [0.25, 0.5, 0.75]) {
      poses.push(orbitPose(a0 + (a1 - a0) * f, aspect, createPose()));
    }
  }
  return poses;
}

/** 開始姿勢が元の画面の定位置にどれだけ近ければ「落ち着いていた」とみなすか */
export const SETTLED_EPS = 0.35;

/**
 * 遷移のカメラ経路:今の姿勢 → 経由点 → 行き先の定位置。
 * 行き先は毎フレーム resolveStation で差し替える(CameraPath.setEnd)。
 */
export function buildTransitionPath(
  start: CameraPose,
  from: Screen,
  to: Screen,
  ctx: StationContext,
): CameraPath {
  const fromStation = resolveStation(from, ctx);
  const settled = poseDistance(start, fromStation) < SETTLED_EPS;
  const vias = viaPoses(from, to, ctx, { settled, outdoor: isOutdoorPosition(start.position) });
  return new CameraPath([start, ...vias, resolveStation(to, ctx)]);
}

export const DEFAULT_STATION_CONTEXT: StationContext = {
  width: 1600,
  height: 900,
  insets: DEFAULT_PAPER_INSETS,
};
