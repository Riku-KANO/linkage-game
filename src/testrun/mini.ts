import type { DesignDoc } from '@/core/model/types';
import { compileMechanism, sampleCycle } from '@/core/kinematics';
import { convexHull } from './hull';

/**
 * 設計図の縮小版(TR-7、U-04)の純粋な部分:表示範囲、脚先の軌道の線、描く部品の一覧。
 * SVG は y が下向きなので、y を反転した座標(cm)で返す。
 */
export interface MiniModel {
  /** SVG の viewBox [x, y, w, h](cm、y 反転済み) */
  viewBox: [number, number, number, number];
  /** 脚先の 1 回転の軌道(SVG の path の d)。脚先がなければ空 */
  footPath: string;
  bars: { link: string; a: number; b: number; crank: boolean }[];
  /** 3 点以上のリンク:凸包の順のジョイント */
  plates: { link: string; joints: number[]; crank: boolean }[];
  fixed: number[];
  foot: number;
  /** 最初のクランク:軸と、軸以外のクランクのジョイント(角度表示用) */
  crank: { pivot: number; pin: number; phase: number } | null;
  /** 設計位置(cm、[x0, y0, ...]、y 上向き) */
  designPos: Float64Array;
  /** 線の太さの目安(viewBox の単位) */
  stroke: number;
}

export function buildMiniModel(design: DesignDoc, steps = 120): MiniModel {
  const mech = compileMechanism(design);
  const n = design.joints.length;
  const designPos = new Float64Array(design.joints.flatMap((j) => [j.x, j.y]));
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const grow = (x: number, y: number) => {
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  };
  for (let j = 0; j < n; j++) grow(designPos[j * 2]!, designPos[j * 2 + 1]!);
  const foot = mech.footIndex;
  let footPath = '';
  if (n > 0 && design.cranks.length > 0) {
    const cycle = sampleCycle(mech, steps);
    cycle.positions.forEach((p, s) => {
      if (!cycle.ok[s]) return;
      for (let j = 0; j < n; j++) grow(p[j * 2]!, p[j * 2 + 1]!);
    });
    if (foot >= 0) {
      const parts: string[] = [];
      let pen = false;
      cycle.positions.forEach((p, s) => {
        if (!cycle.ok[s]) {
          pen = false;
          return;
        }
        parts.push(`${pen ? 'L' : 'M'}${fmt(p[foot * 2]!)} ${fmt(-p[foot * 2 + 1]!)}`);
        pen = true;
      });
      if (parts.length > 2 && cycle.fullRotation) parts.push('Z');
      footPath = parts.join(' ');
    }
  }
  if (!Number.isFinite(xMin)) {
    xMin = -10;
    xMax = 10;
    yMin = -10;
    yMax = 10;
  }
  const span = Math.max(xMax - xMin, yMax - yMin, 1);
  const pad = span * 0.08;
  const viewBox: [number, number, number, number] = [
    xMin - pad,
    -yMax - pad,
    xMax - xMin + 2 * pad,
    yMax - yMin + 2 * pad,
  ];

  const index = new Map(design.joints.map((j, i) => [j.id, i] as const));
  const crankLinks = new Set(design.cranks.map((c) => c.link));
  const bars: MiniModel['bars'] = [];
  const plates: MiniModel['plates'] = [];
  for (const l of design.links) {
    const js = [...new Set(l.joints.map((id) => index.get(id)).filter((i) => i !== undefined))];
    const crank = crankLinks.has(l.id);
    if (js.length === 2) bars.push({ link: l.id, a: js[0]!, b: js[1]!, crank });
    else if (js.length >= 3) {
      const xs = js.map((j) => designPos[j * 2]!);
      const ys = js.map((j) => designPos[j * 2 + 1]!);
      plates.push({ link: l.id, joints: convexHull(xs, ys).map((k) => js[k]!), crank });
    }
  }
  const fixed: number[] = [];
  design.joints.forEach((j, i) => j.fixed && fixed.push(i));
  let crank: MiniModel['crank'] = null;
  const c0 = design.cranks[0];
  if (c0) {
    const pivot = index.get(c0.pivot);
    const link = design.links.find((l) => l.id === c0.link);
    const pinId = link?.joints.find((id) => id !== c0.pivot);
    const pin = pinId !== undefined ? index.get(pinId) : undefined;
    if (pivot !== undefined && pin !== undefined) crank = { pivot, pin, phase: c0.phase };
  }
  return { viewBox, footPath, bars, plates, fixed, foot, crank, designPos, stroke: span * 0.012 };
}

/** クランクの向き(度、0〜360)。pos は cm の [x0, y0, ...] */
export function crankAngleDeg(model: MiniModel, pos: ArrayLike<number>): number | null {
  const c = model.crank;
  if (!c) return null;
  const a = Math.atan2(
    pos[c.pin * 2 + 1]! - pos[c.pivot * 2 + 1]!,
    pos[c.pin * 2]! - pos[c.pivot * 2]!,
  );
  const deg = (a * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function fmt(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}
