import { COURSE_MODEL } from '../layout';
import type { CameraPose } from '../rig/pose';
import { dioramaToWorld, MODEL_GROW, type DioramaLayout } from './diorama';

/**
 * ステージ選択のカメラの構図(純粋な計算)。ステージ一覧のパネル(HUD)は右下に寄っていて、
 * 1280×720 では右の約 624px を覆う(app の `.app-dock--stage`:幅 min(600px, 100vw − 48px)、右 24px)。
 * そこでジオラマ(遊べる章の台地)や T-06 の歩く区間は、パネルに隠れない左側の領域に収める。
 */

/** ステージ一覧のパネルの大きさ(CSS px)。app の `.app-dock--stage` と合わせる */
export const STAGE_PANEL = { maxWidth: 600, right: 24, gap: 16 } as const;

/** 画面の横幅のうち、被写体を置く範囲(左端からの比 0..1)。狭い画面ではパネルを避けきれないので全幅 */
export function freeRegion(width: number): { x0: number; x1: number } {
  const w = Math.max(1, width);
  const covered = Math.min(STAGE_PANEL.maxWidth, w - 48) + STAGE_PANEL.right + STAGE_PANEL.gap;
  const x1 = (w - covered) / w;
  return x1 < 0.4 ? { x0: 0, x1: 1 } : { x0: 0, x1 };
}

export interface FrameSpec {
  /** 被写体の中心(ワールド、m) */
  center: readonly [number, number, number];
  /** 被写体の横幅(x)・奥行き(z)・高さ(y)(m) */
  width: number;
  depth: number;
  height: number;
  /** 見下ろす角度(rad、0 で水平) */
  elevation: number;
  /** 縦の画角(度)と、縦長の画面でも確保する横の画角(度) */
  fov: number;
  minHFov: number;
  /** 被写体が画面(範囲)を占める割合 */
  fill: number;
  /** カメラまでの距離の範囲(m) */
  minDist: number;
  maxDist: number;
}

const toRad = Math.PI / 180;

/**
 * 被写体を、正面(+z 側)から elevation で見下ろし、画面の範囲 region の中央に収める姿勢。
 * 範囲が画面の中央からずれている分だけ、注視点を被写体から横へずらす。out に書いて返す。
 */
export function frameSubject(
  spec: FrameSpec,
  width: number,
  height: number,
  region: { x0: number; x1: number },
  out: CameraPose,
): CameraPose {
  const aspect = Math.max(0.1, width / Math.max(1, height));
  const needed = (Math.atan(Math.tan((spec.minHFov * toRad) / 2) / aspect) * 2) / toRad;
  const fov = Math.max(spec.fov, needed);
  const tv = Math.tan((fov * toRad) / 2);
  const th = tv * aspect;
  const rw = Math.max(0.05, region.x1 - region.x0);
  // 横:被写体の幅が範囲の fill 倍。縦:奥行きと高さを見下ろした見かけの高さが画面の fill 倍
  const dW = spec.width / (rw * spec.fill * 2 * th);
  const apparentH = spec.depth * Math.sin(spec.elevation) + spec.height * Math.cos(spec.elevation);
  const dH = apparentH / (spec.fill * 2 * tv);
  const dist = Math.min(spec.maxDist, Math.max(spec.minDist, dW, dH));
  // 範囲の中央が画面の中央から右へ off(画面幅に対する比)ずれている → 注視点を左へ
  const off = (region.x0 + region.x1) / 2 - 0.5;
  const shift = -off * 2 * th * dist;
  const tx = spec.center[0] + shift;
  const ty = spec.center[1];
  const tz = spec.center[2];
  out.target[0] = tx;
  out.target[1] = ty;
  out.target[2] = tz;
  out.position[0] = tx;
  out.position[1] = ty + dist * Math.sin(spec.elevation);
  out.position[2] = tz + dist * Math.cos(spec.elevation);
  out.up[0] = 0;
  out.up[1] = 1;
  out.up[2] = 0;
  out.fov = fov;
  out.ortho = 0;
  return out;
}

const W0: [number, number, number] = [0, 0, 0];
const W1: [number, number, number] = [0, 0, 0];

/** 遊べる章の台地(ステージのある章)を囲む箱(ワールド、膨らんだ後) */
export function playableBounds(layout: DioramaLayout): {
  center: [number, number, number];
  width: number;
  depth: number;
  height: number;
} {
  const list = layout.plateaus.filter((p) => p.playable);
  const src = list.length > 0 ? list : layout.plateaus;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let top = 0;
  for (const p of src) {
    x0 = Math.min(x0, p.x - p.r);
    x1 = Math.max(x1, p.x + p.r);
    z0 = Math.min(z0, p.z - p.r);
    z1 = Math.max(z1, p.z + p.r);
    top = Math.max(top, p.top);
  }
  dioramaToWorld(COURSE_MODEL.center, x0, 0, z0, W0);
  dioramaToWorld(COURSE_MODEL.center, x1, top, z1, W1);
  return {
    center: [(W0[0] + W1[0]) / 2, (W0[1] + W1[1]) / 2, (W0[2] + W1[2]) / 2],
    width: W1[0] - W0[0],
    depth: W1[2] - W0[2],
    height: W1[1] - W0[1],
  };
}

/** ステージ選択の全体の構図:遊べる章の台地をパネルに隠れない左側へ */
export function overviewPose(
  layout: DioramaLayout,
  width: number,
  height: number,
  out: CameraPose,
): CameraPose {
  const b = playableBounds(layout);
  return frameSubject(
    {
      ...b,
      elevation: 0.72,
      fov: 40,
      minHFov: 56,
      fill: 0.92,
      minDist: 0.9,
      maxDist: 3.2,
    },
    width,
    height,
    freeRegion(width),
    out,
  );
}

/** 歩く機械の模型の大きさの余白(ワールド、m) */
const WALK_MARGIN = 0.07 * MODEL_GROW;

/**
 * T-06 で歩く区間に寄る構図。a・b は模型のローカル座標(m)。歩く区間が長いほど引く。
 * 被写体はパネルに隠れない左側に置く。
 */
export function closeUpPose(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  width: number,
  height: number,
  out: CameraPose,
): CameraPose {
  dioramaToWorld(COURSE_MODEL.center, a[0], a[1], a[2], W0);
  dioramaToWorld(COURSE_MODEL.center, b[0], b[1], b[2], W1);
  return frameSubject(
    {
      center: [(W0[0] + W1[0]) / 2, (W0[1] + W1[1]) / 2, (W0[2] + W1[2]) / 2],
      width: Math.abs(W1[0] - W0[0]) + WALK_MARGIN * 2,
      depth: Math.abs(W1[2] - W0[2]) + WALK_MARGIN,
      height: Math.abs(W1[1] - W0[1]) + 0.05,
      elevation: 0.7,
      fov: 34,
      minHFov: 52,
      fill: 0.75,
      minDist: 0.5,
      maxDist: 1.4,
    },
    width,
    height,
    freeRegion(width),
    out,
  );
}
