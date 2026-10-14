import type { CycleSample } from '@/core/kinematics';
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
