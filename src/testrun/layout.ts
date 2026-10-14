import type { DesignDoc } from '@/core/model/types';
import { CM } from '@/core/model/types';
import type { LegInstance } from '@/core/sim/types';
import { legInstances, mirrorDesignX } from '@/core/kinematics/legs';
import { convexHull, roundedOutline, type P2 } from './hull';

/**
 * 機体の 3D 描画の部品配置(TR-1)。three・React に依存しない純粋な計算。
 *
 *  - 2 点のリンクは棒(箱+両端のボス)、3 点以上のリンクはプレート(角を丸めた凸包を押し出す)
 *  - リンクは z 方向の層に分けて重ならないようにする(同じジョイントを共有するリンクは別の層)
 *  - ジョイントには、つながるリンクの層をすべて貫くピン
 *  - 胴体:固定点を通る軸(z 方向)と、脚の組の間に挟むフレーム板。クランク軸にモーター
 * 長さは m(機体ローカル)。
 */

export interface BarPart {
  link: number;
  a: number;
  b: number;
  layer: number;
  crank: boolean;
}

export interface PlatePart {
  link: number;
  joints: number[];
  /** 剛体変換を求める 2 点(設計位置で最も離れた組) */
  a: number;
  b: number;
  layer: number;
  crank: boolean;
}

export interface PinPart {
  joint: number;
  /** 組の z からのずれ(m) */
  zMin: number;
  zMax: number;
}

export interface MachineLayout {
  jointCount: number;
  linkIds: string[];
  instances: LegInstance[];
  bars: BarPart[];
  plates: PlatePart[];
  pins: PinPart[];
  /** リンク index → 層(-1:描かない) */
  linkLayer: Int32Array;
  layerCount: number;
  /** 層の中心の z(組の z からのずれ、m) */
  layerZ: Float64Array;
  /** 寸法(m) */
  barWidth: number;
  barThickness: number;
  pinRadius: number;
  /** 組の間隔(m) */
  slot: number;
  fixedJoints: number[];
  /** 最初のクランクの軸(固定点の index)。なければ -1 */
  motorJoint: number;
  /** フレーム板の z(m) */
  frameZ: number[];
  /** フレーム板の輪郭(機体ローカル xy、m、反時計回り) */
  frameOutline: P2[];
  /** 胴体の軸の z の範囲(m) */
  shaftZ: [number, number];
  /** 設計姿勢での機体の外接箱(機体ローカル、m、反転脚を含む) */
  extent: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number };
}

export interface LayoutOptions {
  /** 棒の幅(cm)。省略時はリンク長から決める */
  barWidthCm?: number;
}

/**
 * 同じジョイントを共有するリンクが同じ層にならないように層を割り当てる(貪欲な彩色)。
 * 2 点未満のリンクは -1。
 */
export function assignLinkLayers(links: readonly (readonly number[])[]): Int32Array {
  const layer = new Int32Array(links.length).fill(-1);
  const byJoint = new Map<number, number[]>();
  links.forEach((ls, li) => {
    for (const j of ls) {
      const arr = byJoint.get(j) ?? [];
      arr.push(li);
      byJoint.set(j, arr);
    }
  });
  links.forEach((ls, li) => {
    if (ls.length < 2) return;
    const used = new Set<number>();
    for (const j of ls)
      for (const other of byJoint.get(j) ?? []) if (layer[other]! >= 0) used.add(layer[other]!);
    let l = 0;
    while (used.has(l)) l++;
    layer[li] = l;
  });
  return layer;
}

export function buildMachineLayout(design: DesignDoc, options: LayoutOptions = {}): MachineLayout {
  const jointIndex = new Map(design.joints.map((j, i) => [j.id, i] as const));
  const jointCount = design.joints.length;
  const px = (i: number) => design.joints[i]!.x;
  const py = (i: number) => design.joints[i]!.y;
  const links = design.links.map((l) => {
    const idx: number[] = [];
    for (const id of l.joints) {
      const k = jointIndex.get(id);
      if (k !== undefined && !idx.includes(k)) idx.push(k);
    }
    return idx;
  });
  const crankLinks = new Set(design.cranks.map((c) => c.link));
  const instances = legInstances(design);

  // 寸法:リンクの長さの中央値から棒の幅を決める
  const lengths = links
    .filter((ls) => ls.length >= 2)
    .map((ls) => {
      let m = 0;
      for (const a of ls)
        for (const b of ls) m = Math.max(m, Math.hypot(px(a) - px(b), py(a) - py(b)));
      return m;
    })
    .sort((a, b) => a - b);
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)]! : 30;
  const barWidthCm = options.barWidthCm ?? clamp(median * 0.07, 1.2, 4);
  const barWidth = barWidthCm * CM;
  const slot = Math.max(1, design.legs.spacing) * CM;

  const linkLayer = assignLinkLayers(links);
  let layerCount = 0;
  linkLayer.forEach((l) => (layerCount = Math.max(layerCount, l + 1)));
  layerCount = Math.max(1, layerCount);
  // 層の積み重ねは組の間隔の 7 割まで
  const pitch = Math.min(barWidth * 0.62, (slot * 0.7) / layerCount);
  const barThickness = pitch * 0.72;
  const layerZ = new Float64Array(layerCount);
  for (let l = 0; l < layerCount; l++) layerZ[l] = (l - (layerCount - 1) / 2) * pitch;
  const pinRadius = barWidth * 0.17;

  const bars: BarPart[] = [];
  const plates: PlatePart[] = [];
  links.forEach((ls, li) => {
    const layer = linkLayer[li]!;
    if (layer < 0) return;
    const crank = crankLinks.has(design.links[li]!.id);
    if (ls.length === 2) {
      bars.push({ link: li, a: ls[0]!, b: ls[1]!, layer, crank });
      return;
    }
    let a = ls[0]!;
    let b = ls[1]!;
    let best = -1;
    for (let p = 0; p < ls.length; p++) {
      for (let q = p + 1; q < ls.length; q++) {
        const d = Math.hypot(px(ls[p]!) - px(ls[q]!), py(ls[p]!) - py(ls[q]!));
        if (d > best) {
          best = d;
          a = ls[p]!;
          b = ls[q]!;
        }
      }
    }
    plates.push({ link: li, joints: ls.slice(), a, b, layer, crank });
  });

  // ピン:つながるリンクの層をすべて貫く
  const pins: PinPart[] = [];
  const extra = barThickness * 0.45;
  for (let j = 0; j < jointCount; j++) {
    let lo = Infinity;
    let hi = -Infinity;
    links.forEach((ls, li) => {
      const l = linkLayer[li]!;
      if (l < 0 || !ls.includes(j)) return;
      lo = Math.min(lo, layerZ[l]!);
      hi = Math.max(hi, layerZ[l]!);
    });
    if (!Number.isFinite(lo)) continue;
    pins.push({
      joint: j,
      zMin: lo - barThickness / 2 - extra,
      zMax: hi + barThickness / 2 + extra,
    });
  }

  // 胴体
  const fixedJoints: number[] = [];
  for (let j = 0; j < jointCount; j++) if (design.joints[j]!.fixed) fixedJoints.push(j);
  const firstCrank = design.cranks[0];
  const motorJoint = firstCrank ? (jointIndex.get(firstCrank.pivot) ?? -1) : -1;
  const zs = instances.map((i) => i.z).sort((a, b) => a - b);
  const zLo = (zs[0] ?? 0) - slot / 2;
  const zHi = (zs[zs.length - 1] ?? 0) + slot / 2;
  const frameZ: number[] = [zLo];
  for (let k = 1; k < zs.length; k++) frameZ.push((zs[k - 1]! + zs[k]!) / 2);
  frameZ.push(zHi);
  const fxs = fixedJoints.map((j) => px(j) * CM);
  const fys = fixedJoints.map((j) => py(j) * CM);
  const hull = convexHull(fxs, fys).map((k) => ({ x: fxs[k]!, y: fys[k]! }));
  const frameOutline = hull.length ? roundedOutline(hull, barWidth * 1.1, 28) : [];
  const shaftZ: [number, number] = [zLo - barWidth * 0.6, zHi + barWidth * 0.6];

  // 外接箱(反転脚を含む)
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const variants = instances.some((i) => i.mirrored) ? [design, mirrorDesignX(design)] : [design];
  for (const d of variants) {
    for (const j of d.joints) {
      xMin = Math.min(xMin, j.x * CM);
      xMax = Math.max(xMax, j.x * CM);
      yMin = Math.min(yMin, j.y * CM);
      yMax = Math.max(yMax, j.y * CM);
    }
  }
  if (!Number.isFinite(xMin)) {
    xMin = -0.1;
    xMax = 0.1;
    yMin = -0.1;
    yMax = 0.1;
  }

  return {
    jointCount,
    linkIds: design.links.map((l) => l.id),
    instances,
    bars,
    plates,
    pins,
    linkLayer,
    layerCount,
    layerZ,
    barWidth,
    barThickness,
    pinRadius,
    slot,
    fixedJoints,
    motorJoint,
    frameZ,
    frameOutline,
    shaftZ,
    extent: { xMin, xMax, yMin, yMax, zMin: shaftZ[0], zMax: shaftZ[1] },
  };
}

/**
 * プレートの輪郭:設計位置(cm の [x0, y0, ...])から、指定したジョイントの凸包を r(m)だけ
 * ふくらませた形(m、反時計回り)。反転した脚は反転した設計の位置を渡す。
 */
export function plateOutline(
  positionsCm: ArrayLike<number>,
  joints: readonly number[],
  r: number,
  segments = 24,
): P2[] {
  const xs = joints.map((j) => positionsCm[j * 2]! * CM);
  const ys = joints.map((j) => positionsCm[j * 2 + 1]! * CM);
  const hull = convexHull(xs, ys).map((k) => ({ x: xs[k]!, y: ys[k]! }));
  return roundedOutline(hull, r, segments);
}

/** 機体の大きさの目安(m):外接箱の対角の半分 */
export function machineRadius(layout: MachineLayout): number {
  const e = layout.extent;
  return 0.5 * Math.hypot(e.xMax - e.xMin, e.yMax - e.yMin, e.zMax - e.zMin);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
