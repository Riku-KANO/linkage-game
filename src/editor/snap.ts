import type { DesignDoc, JointId, LinkId } from '@/core/model/types';
import {
  closestOnSegment,
  convexHull,
  hullEdges,
  pointInPolygon,
  distToSegment,
  type Pt,
} from './geometry';

/**
 * スナップと当たり判定(ED-1, ED-2)。座標はすべて設計座標(cm)。
 * 画面上の半径(px)は呼び出し側で scale で割って cm にしてから渡す。
 */

export function snapToGrid(p: Pt, step: number): Pt {
  if (!(step > 0)) return { x: p.x, y: p.y };
  // -0 を避ける(表示と比較のため)
  const r = (v: number) => Math.round(v / step) * step + 0;
  return { x: r(p.x), y: r(p.y) };
}

/** 半径 radius 以内で最も近いジョイント(exclude は対象外) */
export function findMagnetJoint(
  design: DesignDoc,
  p: Pt,
  radius: number,
  exclude?: ReadonlySet<JointId>,
): { id: JointId; dist: number } | null {
  let best: { id: JointId; dist: number } | null = null;
  for (const j of design.joints) {
    if (exclude?.has(j.id)) continue;
    const d = Math.hypot(j.x - p.x, j.y - p.y);
    if (d <= radius && (!best || d < best.dist)) best = { id: j.id, dist: d };
  }
  return best;
}

export interface SnapOptions {
  /** グリッドの間隔(cm)。null ならグリッドに吸着しない */
  grid: number | null;
  /** 既存ジョイントへの吸い寄せ半径(cm)。0 なら吸い寄せない */
  magnetRadius: number;
  exclude?: ReadonlySet<JointId>;
}

export interface SnapResult {
  x: number;
  y: number;
  /** 吸い寄せたジョイント(なければ null) */
  joint: JointId | null;
}

/** 吸い寄せ(ジョイント優先)→ グリッドの順でスナップする */
export function snapPoint(design: DesignDoc, p: Pt, opts: SnapOptions): SnapResult {
  if (opts.magnetRadius > 0) {
    const m = findMagnetJoint(design, p, opts.magnetRadius, opts.exclude);
    if (m) {
      const j = design.joints.find((jj) => jj.id === m.id)!;
      return { x: j.x, y: j.y, joint: j.id };
    }
  }
  const g = opts.grid ? snapToGrid(p, opts.grid) : p;
  return { x: g.x, y: g.y, joint: null };
}

export type Hit =
  | { kind: 'joint'; id: JointId }
  | {
      kind: 'link';
      id: LinkId;
      /** リンク上で最も近い点(棒の途中にジョイントを足すとき用) */
      at: Pt;
    };

/** リンクの外形(凸包)。設計位置から求める */
export function linkHull(design: DesignDoc, linkId: LinkId): Pt[] {
  const link = design.links.find((l) => l.id === linkId);
  if (!link) return [];
  const byId = new Map(design.joints.map((j) => [j.id, j]));
  const pts = link.joints.map((id) => byId.get(id)).filter((j) => j !== undefined);
  return convexHull(pts);
}

/**
 * 当たり判定:ジョイントを優先し、なければリンク(外形の辺から tolLink 以内、または多角形の内側)。
 */
export function hitTest(
  design: DesignDoc,
  p: Pt,
  tolJoint: number,
  tolLink: number,
  exclude?: ReadonlySet<JointId>,
): Hit | null {
  const j = findMagnetJoint(design, p, tolJoint, exclude);
  if (j) return { kind: 'joint', id: j.id };
  let best: { id: LinkId; d: number; at: Pt } | null = null;
  for (const link of design.links) {
    const hull = linkHull(design, link.id);
    const edges = hullEdges(hull);
    for (const [a, b] of edges) {
      const d = distToSegment(p, a, b);
      if (d <= tolLink && (!best || d < best.d)) {
        const c = closestOnSegment(p, a, b);
        best = { id: link.id, d, at: { x: c.x, y: c.y } };
      }
    }
    if (hull.length >= 3 && pointInPolygon(p, hull) && (!best || best.d > 0)) {
      best = { id: link.id, d: 0, at: { x: p.x, y: p.y } };
    }
  }
  return best ? { kind: 'link', id: best.id, at: best.at } : null;
}

/** 矩形範囲選択:範囲内のジョイントと、全ジョイントが範囲内にあるリンク */
export function selectInRect(
  design: DesignDoc,
  a: Pt,
  b: Pt,
): { joints: JointId[]; links: LinkId[] } {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const inside = new Set(
    design.joints
      .filter((j) => j.x >= minX && j.x <= maxX && j.y >= minY && j.y <= maxY)
      .map((j) => j.id),
  );
  const links = design.links
    .filter((l) => l.joints.length > 0 && l.joints.every((id) => inside.has(id)))
    .map((l) => l.id);
  return { joints: [...inside], links };
}
