import { COURSE_MODEL } from '../layout';
import type { CameraPose } from '../rig/pose';
import { dioramaToWorld } from './diorama';

/**
 * T-06(結果 → ステージ選択)の時間割と、歩く機械に寄るカメラ。純粋な計算。
 *
 * カメラは屋外の試走コースから窓を通って模型へ戻ってくるので、模型が見えるのは遷移の後半になる。
 * 機械は遷移の進行度 start から歩き出し、遷移の終わり(カメラが着く瞬間)に次の目印に着く。
 * その間、ステージ選択の定位置を「歩く区間に寄った姿勢」に差し替え、歩き終えて hold 秒後に戻す
 * (カメラはばねで全体が見える定位置へ引く)。
 */
export const T06_WALK = {
  /** 歩き出す遷移の進行度(線形の時間 0..1) */
  start: 0.4,
  /** 着いてから全体の定位置へ引くまで(s) */
  hold: 0.7,
  /** 遷移がこれより早く終わったらスキップされたとみなす(予定の長さに対する比) */
  skippedBefore: 0.95,
} as const;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 遷移の線形の進行度 t → 歩いた割合 0..1(歩き出しと着く前は滑らかに) */
export function t06WalkProgress(t: number): number {
  const k = clamp01((t - T06_WALK.start) / (1 - T06_WALK.start));
  return k * k * (3 - 2 * k);
}

/** 寄るカメラ:見下ろす角度(rad)・最小の横の画角(度)・画面の左寄りに置く量(距離に対する比) */
const CLOSE_UP = { elevation: 0.7, fov: 34, minHFov: 52, shift: 0.16 } as const;

function fitFov(fov: number, minHFov: number, aspect: number): number {
  const needed = (Math.atan(Math.tan((minHFov * Math.PI) / 360) / aspect) * 360) / Math.PI;
  return Math.max(fov, needed);
}

const A: [number, number, number] = [0, 0, 0];
const B: [number, number, number] = [0, 0, 0];

/**
 * 模型の上の 2 点(ローカル座標、m)の間を歩く機械を見下ろす姿勢。歩く区間が長いほど引く。
 * 被写体は画面の少し左に置く(右側にステージ一覧のパネルが出るため)。out に書いて返す。
 */
export function closeUpPose(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  aspect: number,
  out: CameraPose,
): CameraPose {
  dioramaToWorld(COURSE_MODEL.center, a[0], a[1], a[2], A);
  dioramaToWorld(COURSE_MODEL.center, b[0], b[1], b[2], B);
  const span = Math.hypot(B[0] - A[0], B[2] - A[2]);
  const dist = Math.min(1.15, Math.max(0.5, 0.42 + 1.25 * span));
  const shift = CLOSE_UP.shift * dist;
  const tx = (A[0] + B[0]) / 2 + shift;
  const ty = (A[1] + B[1]) / 2;
  const tz = (A[2] + B[2]) / 2;
  out.target[0] = tx;
  out.target[1] = ty;
  out.target[2] = tz;
  out.position[0] = tx;
  out.position[1] = ty + dist * Math.sin(CLOSE_UP.elevation);
  out.position[2] = tz + dist * Math.cos(CLOSE_UP.elevation);
  out.up[0] = 0;
  out.up[1] = 1;
  out.up[2] = 0;
  out.fov = fitFov(CLOSE_UP.fov, CLOSE_UP.minHFov, Math.max(0.1, aspect));
  out.ortho = 0;
  return out;
}
