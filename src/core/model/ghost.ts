import type { Quat, Vec3 } from '@/core/sim/types';
import { isFiniteNumber, isRecord } from './guards';

/**
 * ゴースト:試走中の機体の姿勢の記録(U-02 の「送り主のゴーストと競う」、試走の前回ゴースト)。
 *
 * 機体(フレーム)の位置・向きとモーター角を一定の頻度で記録する。脚の姿勢はモーター角と設計から
 * 運動学で再現できるので記録しない。単位はワールド座標(m)と rad。
 *
 * 共有リンクに入れるときは encodeGhostCompact で量子化(位置 1mm、四元数の成分 1e-3、
 * モーター角 1mrad)し、チャンネルごとに差分(1 次または 2 次)をとった整数列にする。
 */

/** 1 フレームの数の個数:px, py, pz, qx, qy, qz, qw, モーター角 */
export const GHOST_STRIDE = 8;
/** 既定の記録頻度(Hz) */
export const GHOST_DEFAULT_HZ = 10;
export const GHOST_MAX_HZ = 60;
/** フレーム数の上限(10Hz で 10 分) */
export const MAX_GHOST_FRAMES = 6000;
/**
 * 四元数の長さの許容誤差。量子化した四元数の誤差はこれより小さいので、この範囲なら正規化せず
 * 冪等に保つ(sampleGhost は常に正規化して返す)
 */
const QUAT_TOL = 5e-3;

export interface Ghost {
  /** 記録の頻度(Hz)。フレーム k は時刻 k / hz */
  hz: number;
  /** フレームごとに GHOST_STRIDE 個:px, py, pz(m)、qx, qy, qz, qw(単位四元数)、モーター角(rad) */
  frames: number[];
}

export interface GhostSample {
  position: Vec3;
  quaternion: Quat;
  motorAngle: number;
}

export function ghostFrameCount(g: Ghost): number {
  return Math.floor(g.frames.length / GHOST_STRIDE);
}

/** 記録の長さ(s) */
export function ghostDuration(g: Ghost): number {
  return Math.max(0, ghostFrameCount(g) - 1) / g.hz;
}

/**
 * 時刻 t(s)の姿勢を前後のフレームから補間する(位置・モーター角は線形、向きは正規化線形補間)。
 * 記録の範囲外は端のフレームに留める。フレームがなければ null。
 */
export function sampleGhost(g: Ghost, t: number): GhostSample | null {
  const n = ghostFrameCount(g);
  if (n === 0) return null;
  const u = Math.min(n - 1, Math.max(0, (Number.isFinite(t) ? t : 0) * g.hz));
  const i = Math.min(n - 2, Math.floor(u));
  if (i < 0) return frameAt(g.frames, 0, 0, 0);
  return frameAt(g.frames, i, i + 1, u - i);
}

function frameAt(f: number[], i: number, j: number, s: number): GhostSample {
  const a = i * GHOST_STRIDE;
  const b = j * GHOST_STRIDE;
  const at = (k: number) => f[k] ?? 0;
  const lerp = (c: number) => at(a + c) + (at(b + c) - at(a + c)) * s;
  // q と -q は同じ回転なので、近い側を選んでから補間する
  const sign =
    at(a + 3) * at(b + 3) + at(a + 4) * at(b + 4) + at(a + 5) * at(b + 5) + at(a + 6) * at(b + 6) <
    0
      ? -1
      : 1;
  const q = [3, 4, 5, 6].map((c) => at(a + c) + (sign * at(b + c) - at(a + c)) * s);
  const len = Math.hypot(q[0]!, q[1]!, q[2]!, q[3]!) || 1;
  return {
    position: { x: lerp(0), y: lerp(1), z: lerp(2) },
    quaternion: { x: q[0]! / len, y: q[1]! / len, z: q[2]! / len, w: q[3]! / len },
    motorAngle: lerp(7),
  };
}

/** シミュレーションのスナップショットのうちゴーストに要る部分(SimSnapshot をそのまま渡せる) */
export interface GhostSource {
  time: number;
  body: { position: Vec3; quaternion: Quat };
  motorAngle: number;
}

export interface GhostRecorder {
  readonly hz: number;
  /** 毎ステップ呼んでよい。記録時刻(k / hz)を過ぎたときだけフレームを足す */
  record(s: GhostSource): void;
  add(time: number, position: Vec3, quaternion: Quat, motorAngle: number): void;
  /** これまでの記録(コピー) */
  ghost(): Ghost;
  reset(): void;
}

/**
 * 試走中にゴーストを記録する。時刻 k / hz を過ぎた最初の呼び出しの姿勢をフレーム k にする
 * (240Hz の固定ステップなら 10Hz の記録時刻とちょうど一致する)。呼び出しが飛んだときは
 * 同じ姿勢で埋め、フレーム番号と時刻の対応を保つ。
 */
export function createGhostRecorder(hz: number = GHOST_DEFAULT_HZ): GhostRecorder {
  if (!(hz > 0 && hz <= GHOST_MAX_HZ)) throw new Error(`ghost hz out of range: ${hz}`);
  let frames: number[] = [];
  const EPS = 1e-6;
  const add = (time: number, p: Vec3, q: Quat, motorAngle: number) => {
    if (!Number.isFinite(time)) return;
    while (frames.length / GHOST_STRIDE < MAX_GHOST_FRAMES) {
      const k = frames.length / GHOST_STRIDE;
      if (time + EPS < k / hz) break;
      frames.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w, motorAngle);
    }
  };
  return {
    hz,
    add,
    record: (s) => add(s.time, s.body.position, s.body.quaternion, s.motorAngle),
    ghost: () => ({ hz, frames: frames.slice() }),
    reset: () => {
      frames = [];
    },
  };
}

/** 外から来たゴーストの検査。だめなら null。長さのずれた四元数は正規化して返す */
export function validateGhost(input: unknown): Ghost | null {
  try {
    if (!isRecord(input)) return null;
    const { hz, frames } = input;
    if (!isFiniteNumber(hz) || hz <= 0 || hz > GHOST_MAX_HZ) return null;
    if (!Array.isArray(frames) || frames.length === 0 || frames.length % GHOST_STRIDE !== 0) {
      return null;
    }
    if (frames.length / GHOST_STRIDE > MAX_GHOST_FRAMES) return null;
    const out: number[] = new Array<number>(frames.length);
    for (let k = 0; k < frames.length; k++) {
      const v: unknown = frames[k];
      if (!isFiniteNumber(v) || Math.abs(v) > MAX_GHOST_VALUE) return null;
      out[k] = v;
    }
    normalizeQuats(out, QUAT_TOL);
    return { hz, frames: out };
  } catch {
    return null;
  }
}

/** 位置(m)とモーター角(rad)の上限。これを超えるゴーストは壊れているとみなす */
const MAX_GHOST_VALUE = 1e6;

/**
 * 四元数を単位長にする。長さの誤差が tol 以下なら触らない(量子化した値を冪等に保つため)。
 * 長さ 0 は単位元にする。
 */
function normalizeQuats(f: number[], tol = 0) {
  for (let o = 0; o < f.length; o += GHOST_STRIDE) {
    const len = Math.hypot(f[o + 3]!, f[o + 4]!, f[o + 5]!, f[o + 6]!);
    if (Math.abs(len - 1) <= tol) continue;
    if (len < 1e-9) {
      f[o + 3] = 0;
      f[o + 4] = 0;
      f[o + 5] = 0;
      f[o + 6] = 1;
    } else {
      for (let c = 3; c < 7; c++) f[o + c] = f[o + c]! / len;
    }
  }
}

// ---- 共有リンク用の短縮形式 ----

/**
 * チャンネルごとの量子化の倍率:位置 1mm、四元数の成分 1e-3(向きの誤差は約 1mrad で、
 * 1m 先で約 1mm。位置の精度とつり合う)、モーター角 1mrad
 */
const QUANT = [1e3, 1e3, 1e3, 1e3, 1e3, 1e3, 1e3, 1e3] as const;

/**
 * 短縮形式:[hz, orders, data]。
 *  - orders:チャンネルごとの差分の次数(1 か 2)
 *  - data:チャンネル順(全フレームのチャンネル 0、次にチャンネル 1 …)に並べた残差の整数列。
 *    次数 1 は r[k] = q[k] − q[k−1]、次数 2 は r[k] = q[k] − 2q[k−1] + q[k−2](先頭は低い次数)
 */
export type GhostCompact = [hz: number, orders: number[], data: number[]];

export function encodeGhostCompact(g: Ghost): GhostCompact {
  const n = ghostFrameCount(g);
  // 四元数の符号をそろえて(q と -q は同じ回転)、差分が小さく連続するようにする
  const f = g.frames.slice(0, n * GHOST_STRIDE);
  normalizeQuats(f, QUAT_TOL);
  for (let k = 1; k < n; k++) {
    const a = (k - 1) * GHOST_STRIDE;
    const b = k * GHOST_STRIDE;
    let dot = 0;
    for (let c = 3; c < 7; c++) dot += f[a + c]! * f[b + c]!;
    if (dot < 0) for (let c = 3; c < 7; c++) f[b + c] = -f[b + c]!;
  }
  const orders: number[] = [];
  const data: number[] = [];
  for (let c = 0; c < GHOST_STRIDE; c++) {
    const q = new Array<number>(n);
    // `|| 0` で -0 を 0 にそろえる(JSON では同じだが比較で区別される)
    for (let k = 0; k < n; k++) q[k] = Math.round(f[k * GHOST_STRIDE + c]! * QUANT[c]!) || 0;
    const r1 = residuals(q, 1);
    const r2 = residuals(q, 2);
    const cost = (r: number[]) => r.reduce((s, v) => s + String(v).length, 0);
    const use2 = cost(r2) < cost(r1);
    orders.push(use2 ? 2 : 1);
    data.push(...(use2 ? r2 : r1));
  }
  return [g.hz, orders, data];
}

function residuals(q: number[], order: 1 | 2): number[] {
  return q.map((v, k) => {
    if (k === 0) return v;
    if (k === 1 || order === 1) return v - q[k - 1]!;
    return v - 2 * q[k - 1]! + q[k - 2]!;
  });
}

/** 短縮形式からゴーストに戻す。形が壊れていれば null */
export function decodeGhostCompact(v: unknown): Ghost | null {
  try {
    if (!Array.isArray(v) || v.length !== 3) return null;
    const [hz, orders, data] = v as unknown[];
    if (!isFiniteNumber(hz) || hz <= 0 || hz > GHOST_MAX_HZ) return null;
    if (!Array.isArray(orders) || orders.length !== GHOST_STRIDE) return null;
    if (!orders.every((o) => o === 1 || o === 2)) return null;
    if (!Array.isArray(data) || data.length === 0 || data.length % GHOST_STRIDE !== 0) return null;
    const n = data.length / GHOST_STRIDE;
    if (n > MAX_GHOST_FRAMES) return null;
    const frames = new Array<number>(data.length);
    for (let c = 0; c < GHOST_STRIDE; c++) {
      const limit = MAX_GHOST_VALUE * QUANT[c]!;
      let p1 = 0;
      let p2 = 0;
      for (let k = 0; k < n; k++) {
        const r: unknown = data[c * n + k];
        if (!Number.isSafeInteger(r)) return null;
        const res = r as number;
        const q = k === 0 ? res : k === 1 || orders[c] === 1 ? res + p1 : res + 2 * p1 - p2;
        if (!Number.isSafeInteger(q) || Math.abs(q) > limit) return null;
        frames[k * GHOST_STRIDE + c] = q / QUANT[c]!;
        p2 = p1;
        p1 = q;
      }
    }
    normalizeQuats(frames, QUAT_TOL);
    return { hz, frames };
  } catch {
    return null;
  }
}
