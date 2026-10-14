import {
  analyzeMechanism,
  compileMechanism,
  solvePose,
  type CompiledMechanism,
  type CycleSample,
  type MechanismAnalysis,
} from '@/core/kinematics';
import type { DesignDoc } from '@/core/model/types';
import { FIGURE_DESIGNS, type FigureDesignId } from './designs';

/**
 * 図の動きのデータ(純関数)。機構は本物のソルバーで 1 回転分を解いておき、
 * 描画ではその間を補間して見せる。React に依存しない。
 */

export interface CycleFigure {
  design: DesignDoc;
  mech: CompiledMechanism;
  /** 1 回転分の解(analysis.cycle と同じもの) */
  cycle: CycleSample;
  analysis: MechanismAnalysis;
}

/** 図の 1 回転のサンプル数(ヤンセンでも数 ms で解ける) */
export const FIGURE_STEPS = 120;

const cache = new Map<string, CycleFigure>();

/** 設計を解析して 1 回転分の姿勢を持つ。同じ図は使い回す */
export function cycleFigure(id: FigureDesignId): CycleFigure {
  const hit = cache.get(id);
  if (hit) return hit;
  const fig = analyzeFigure(FIGURE_DESIGNS[id]());
  cache.set(id, fig);
  return fig;
}

export function analyzeFigure(design: DesignDoc, steps = FIGURE_STEPS): CycleFigure {
  const analysis = analyzeMechanism(design, { steps });
  return { design, mech: analysis.compiled, cycle: analysis.cycle, analysis };
}

export interface Pose {
  positions: Float64Array;
  ok: boolean;
  /** いちばん近いサンプルの番号 */
  index: number;
}

const wrap01 = (p: number) => p - Math.floor(p);

/**
 * 位相 phase(0..1、1 回転)の姿勢。隣り合うサンプルがどちらも組み立てられれば線形に補間し、
 * そうでなければ近い方のサンプル(組立不能の妥協位置を含む)をそのまま使う。
 */
export function poseAt(cycle: CycleSample, phase: number, out?: Float64Array): Pose {
  const n = cycle.steps;
  const s = wrap01(phase) * n;
  const i = Math.floor(s) % n;
  const k = (i + 1) % n;
  const f = s - Math.floor(s);
  const a = cycle.positions[i]!;
  const b = cycle.positions[k]!;
  const res = out && out.length === a.length ? out : new Float64Array(a.length);
  const okA = cycle.ok[i]!;
  const okB = cycle.ok[k]!;
  if (okA && okB) {
    for (let j = 0; j < a.length; j++) res[j] = a[j]! + (b[j]! - a[j]!) * f;
    return { positions: res, ok: true, index: f < 0.5 ? i : k };
  }
  const near = f < 0.5 ? i : k;
  res.set(cycle.positions[near]!);
  return { positions: res, ok: cycle.ok[near]!, index: near };
}

/** 点 index の軌道([x0, y0, x1, y1, ...]、サンプル順) */
export function jointPath(cycle: CycleSample, index: number): Float64Array {
  const out = new Float64Array(cycle.steps * 2);
  for (let s = 0; s < cycle.steps; s++) {
    const p = cycle.positions[s]!;
    out[s * 2] = p[index * 2]!;
    out[s * 2 + 1] = p[index * 2 + 1]!;
  }
  return out;
}

/**
 * 五節リンクのぐらつき:クランクを設計の角度で止めたまま、右の棒を ±amplitudeDeg 揺らした姿勢の列。
 * 補助の機構(fiveBarSwayDriver)を solvePose で前の姿勢から連続に解く。行って戻る 1 往復分。
 */
export function fiveBarSway(steps = 48, amplitudeDeg = 20): Float64Array[] {
  const mech = compileMechanism(FIGURE_DESIGNS.fiveBarSwayDriver());
  const amp = (amplitudeDeg * Math.PI) / 180;
  const out: Float64Array[] = [];
  let prev: Float64Array | null = null;
  for (let s = 0; s < steps; s++) {
    const theta = amp * Math.sin((2 * Math.PI * s) / steps);
    const res = solvePose(mech, theta, { prev });
    out.push(res.positions);
    prev = res.positions;
  }
  return out;
}

export interface WalkerTrack {
  /** 時間の刻み k(0..steps)ごとの機体の位置(cm)。bodyX[0] = 0 */
  bodyX: Float64Array;
  /** 刻み k ごとの機体の高さ:いちばん低い脚先が地面(y = 0)につく高さ */
  bodyY: Float64Array;
  /** 1 回転で進む距離(cm)。前へ進めば正 */
  advance: number;
  /** モーターの回る向き。刻み k のサンプルは (dir·k) mod steps */
  dir: 1 | -1;
}

/**
 * 位相をずらした同じ脚を何本か並べた機械が、地面の上をどう進むか。各刻みで最も低い脚先が
 * 地面について滑らないとして、その脚先が機体に対して動いた分だけ機体を逆に動かす。
 * offsets は脚ごとの位相(1 回転を 1 とする割合)、dir はモーターの回る向き(rpm の符号)。
 */
export function walkerTrack(
  cycle: CycleSample,
  footIndex: number,
  offsets: readonly number[],
  dir: 1 | -1 = 1,
): WalkerTrack {
  const n = cycle.steps;
  const bodyX = new Float64Array(n + 1);
  const bodyY = new Float64Array(n);
  const foot = (k: number, off: number) => cycle.positions[legSample(cycle, dir * k, off)]!;
  for (let k = 0; k < n; k++) {
    let low = 0;
    let lowY = Infinity;
    offsets.forEach((off, j) => {
      const y = foot(k, off)[footIndex * 2 + 1]!;
      if (y < lowY) {
        lowY = y;
        low = j;
      }
    });
    bodyY[k] = -lowY;
    const off = offsets[low] ?? 0;
    const x0 = foot(k, off)[footIndex * 2]!;
    const x1 = foot(k + 1, off)[footIndex * 2]!;
    bodyX[k + 1] = bodyX[k]! - (x1 - x0);
  }
  return { bodyX, bodyY, advance: bodyX[n]!, dir };
}

/** 脚 k の位相 offset に合わせたサンプル番号 */
export function legSample(cycle: CycleSample, s: number, offset: number): number {
  const n = cycle.steps;
  return (((s + Math.round(offset * n)) % n) + n) % n;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** 位置の配列(と追加の点)を囲む範囲 */
export function boundsOf(
  positions: readonly Float64Array[],
  extra: readonly { x: number; y: number }[] = [],
): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const p of positions) for (let i = 0; i + 1 < p.length; i += 2) add(p[i]!, p[i + 1]!);
  for (const p of extra) add(p.x, p.y);
  if (!Number.isFinite(minX)) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  return { minX, maxX, minY, maxY };
}

export interface FitMap {
  /** 設計座標(cm、y 上)→ 図の座標(px、y 下) */
  x(x: number): number;
  y(y: number): number;
  /** 1 cm が何 px か */
  scale: number;
}

/** 範囲 b を width×height の図に、余白 pad(px)を残して縦横比を保って収める(中央寄せ) */
export function fitMap(b: Bounds, width: number, height: number, pad = 12): FitMap {
  const w = Math.max(1e-6, b.maxX - b.minX);
  const h = Math.max(1e-6, b.maxY - b.minY);
  const scale = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
  const ox = (width - w * scale) / 2 - b.minX * scale;
  const oy = (height - h * scale) / 2 + b.maxY * scale;
  return { x: (x) => ox + x * scale, y: (y) => oy - y * scale, scale };
}

/** モーターの回る向き(rpm の符号。0 は +1 とみなす)。図はこの向きに 1 回転を再生する */
export function motorDir(design: DesignDoc): 1 | -1 {
  return design.motor.rpm < 0 ? -1 : 1;
}
