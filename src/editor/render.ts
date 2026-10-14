import { walkDirection, type CycleSample, type MechanismAnalysis } from '@/core/kinematics';
import type { DesignDoc } from '@/core/model/types';
import { convexHull } from './geometry';
import { toScreen, type Camera } from './viewport';

/** 描画用の純関数(画面座標 px の文字列を作る) */

const f = (v: number) => (Math.round(v * 10) / 10).toString();

/**
 * 1 回転の軌道を SVG パスにする。組み立てられた区間(ok)と組立不能の区間(fail)を分ける。
 * 全周で組み立てられるなら閉じたループにする。
 */
export function trajectoryPaths(
  cycle: CycleSample,
  jointIndex: number,
  cam: Camera,
): { ok: string; fail: string } {
  const n = cycle.positions.length;
  if (n === 0) return { ok: '', fail: '' };
  const pt = (s: number) => {
    const p = cycle.positions[s]!;
    return toScreen(cam, p[jointIndex * 2]!, p[jointIndex * 2 + 1]!);
  };
  let ok = '';
  let fail = '';
  for (let s = 0; s < n; s++) {
    const a = pt(s);
    const next = (s + 1) % n;
    const b = pt(next);
    const segOk = cycle.ok[s]! && cycle.ok[next]!;
    const seg = `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`;
    if (segOk) ok += seg;
    else fail += seg;
  }
  return { ok: mergeSegments(ok), fail: mergeSegments(fail) };
}

/** "M a L b M b L c" のような連続区間を "M a L b L c" にまとめる(パスを短くする) */
function mergeSegments(d: string): string {
  return d.replace(/L([-\d.]+) ([-\d.]+)M\1 \2/g, 'L$1 $2');
}

/** 軌道の振れ幅(cm)。ほとんど動かない点の軌道は描かない */
export function trajectoryExtent(cycle: CycleSample, jointIndex: number): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of cycle.positions) {
    const x = p[jointIndex * 2]!;
    const y = p[jointIndex * 2 + 1]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

/** 剛体リンクの外形の頂点順(ジョイント index)。剛体運動しても凸包の順は変わらない */
export function linkOutlineOrder(design: DesignDoc, linkIndex: number): number[] {
  const link = design.links[linkIndex];
  if (!link) return [];
  const idx = new Map(design.joints.map((j, i) => [j.id, i]));
  const pts = link.joints
    .map((id) => idx.get(id))
    .filter((i) => i !== undefined)
    .map((i) => ({ x: design.joints[i]!.x, y: design.joints[i]!.y, i }));
  const uniq = pts.filter((p, k) => pts.findIndex((q) => q.i === p.i) === k);
  if (uniq.length <= 2) return uniq.map((p) => p.i);
  const hull = convexHull(uniq) as { x: number; y: number; i: number }[];
  return hull.length >= 2 ? hull.map((p) => p.i) : uniq.map((p) => p.i);
}

/** 画面座標の点列 → polygon の points 属性 */
export function pointsAttr(pts: readonly { x: number; y: number }[]): string {
  return pts.map((p) => `${f(p.x)},${f(p.y)}`).join(' ');
}

/** 表示用の数値(小数 1 桁、-0 なし) */
export function fmt1(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (r === 0 ? 0 : r).toFixed(1);
}

/** サンプル順に a から b まで(1 周をまたいでよい)の index 列 */
export function sampleRun(steps: number, a: number, b: number): number[] {
  if (steps <= 0 || a < 0 || b < 0) return [];
  const out: number[] = [];
  for (let k = a; ; k = (k + 1) % steps) {
    out.push(k);
    if (k === b || out.length > steps) break;
  }
  return out;
}

/** サンプル index 列の点の軌道を、画面座標の折れ線にする */
export function polylinePath(
  cycle: CycleSample,
  jointIndex: number,
  samples: readonly number[],
  cam: Camera,
): string {
  let d = '';
  samples.forEach((s, i) => {
    const p = cycle.positions[s];
    if (!p) return;
    const q = toScreen(cam, p[jointIndex * 2]!, p[jointIndex * 2 + 1]!);
    d += `${i === 0 ? 'M' : 'L'}${f(q.x)} ${f(q.y)}`;
  });
  return d;
}

/** 脚先の軌道の寸法(設計座標 cm)。歩幅・足上げの寸法線と進む向きの矢印に使う */
export interface FootGuide {
  /** 接地区間のサンプル index(サンプル順) */
  contact: number[];
  stride: { x0: number; x1: number; y: number; length: number };
  lift: { x: number; y0: number; y1: number; length: number };
  /** 機体が進む x の向き(rpm の符号を考慮)。0:判定できない・止まっている */
  walk: 1 | -1 | 0;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export function footGuide(analysis: MechanismAnalysis, rpm: number): FootGuide | null {
  const m = analysis.foot;
  const fi = analysis.compiled.footIndex;
  const cycle = analysis.cycle;
  if (!m || fi < 0 || m.contactStart < 0 || analysis.compiled.design.cranks.length === 0)
    return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  cycle.positions.forEach((p, s) => {
    if (!cycle.ok[s]) return;
    const x = p[fi * 2]!;
    const y = p[fi * 2 + 1]!;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  if (!Number.isFinite(minX)) return null;
  const contact = sampleRun(cycle.steps, m.contactStart, m.contactEnd);
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const s of contact) {
    const x = cycle.positions[s]![fi * 2]!;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
  }
  return {
    contact,
    stride: { x0, x1, y: m.minY, length: m.stride },
    lift: { x: maxX, y0: m.minY, y1: m.minY + m.lift, length: m.lift },
    walk: walkDirection(m, rpm),
    bounds: { minX, maxX, minY, maxY },
  };
}
