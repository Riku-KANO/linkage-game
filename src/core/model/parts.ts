import type { DesignDoc } from './types';

/**
 * 部品ごとのコストと重量(E-07)。ステージの予算制約とシミュレーションの質量の両方がここを使う。
 * 数値はゲームバランス用の目安。調整はここだけで行う。
 */
export const PART_SPECS = {
  /** リンク 1 本あたり(端の金具) */
  linkBase: { cost: 4, mass: 0.04 },
  /** リンクの長さ 1cm あたり */
  linkPerCm: { cost: 0.5, mass: 0.012 },
  /** ピン(ジョイントで 2 つの部品をつなぐごとに 1 本) */
  pin: { cost: 3, mass: 0.02 },
  /** 固定点(フレームの軸受け) */
  fixed: { cost: 6, mass: 0.08 },
  /** クランク(モーターと軸)。脚列で共有するので機体に 1 つ */
  crank: { cost: 30, mass: 0.6 },
} as const;

export interface Bill {
  /** 設計した部品の数(片脚の設計図の部品数。スコアの「部品数」) */
  parts: number;
  /** 機体全体のコスト(脚列の複製を含む) */
  cost: number;
  /** 機体全体の機構の質量(kg、胴体を除く) */
  mass: number;
  /** 片脚あたり */
  perLeg: {
    links: number;
    linkLengthCm: number;
    pins: number;
    fixed: number;
    cost: number;
    mass: number;
  };
  /** 脚列の組数(反転を含む) */
  instances: number;
}

/** リンクの長さ:リンク上の点を結ぶ最小全域木の辺の長さの合計(2 点なら棒の長さ) */
export function linkLengthCm(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  const inTree = new Array<boolean>(points.length).fill(false);
  const best = new Array<number>(points.length).fill(Infinity);
  best[0] = 0;
  let total = 0;
  for (let k = 0; k < points.length; k++) {
    let u = -1;
    for (let i = 0; i < points.length; i++) if (!inTree[i] && (u < 0 || best[i]! < best[u]!)) u = i;
    inTree[u] = true;
    total += best[u]!;
    for (let v = 0; v < points.length; v++) {
      if (inTree[v]) continue;
      const d = Math.hypot(points[u]!.x - points[v]!.x, points[u]!.y - points[v]!.y);
      if (d < best[v]!) best[v] = d;
    }
  }
  return total;
}

export function instanceCount(design: DesignDoc): number {
  return Math.max(1, design.legs.count) * (design.legs.mirrorX ? 2 : 1);
}

/** 部品数・コスト・重量を集計する */
export function computeBill(design: DesignDoc): Bill {
  const byId = new Map(design.joints.map((j) => [j.id, j]));
  let linkLength = 0;
  let links = 0;
  for (const l of design.links) {
    const pts = l.joints.map((id) => byId.get(id)).filter((p) => p !== undefined);
    if (pts.length < 2) continue;
    links++;
    linkLength += linkLengthCm(pts);
  }
  let pins = 0;
  let fixed = 0;
  for (const j of design.joints) {
    let bodies = j.fixed ? 1 : 0;
    for (const l of design.links) if (l.joints.includes(j.id)) bodies++;
    pins += Math.max(0, bodies - 1);
    if (j.fixed) fixed++;
  }
  const S = PART_SPECS;
  const legCost =
    links * S.linkBase.cost +
    linkLength * S.linkPerCm.cost +
    pins * S.pin.cost +
    fixed * S.fixed.cost;
  const legMass =
    links * S.linkBase.mass +
    linkLength * S.linkPerCm.mass +
    pins * S.pin.mass +
    fixed * S.fixed.mass;
  const instances = instanceCount(design);
  const cranks = design.cranks.length;
  return {
    parts: links + pins + fixed + cranks,
    cost: round1(legCost * instances + cranks * S.crank.cost),
    mass: round3(legMass * instances + cranks * S.crank.mass),
    perLeg: {
      links,
      linkLengthCm: round1(linkLength),
      pins,
      fixed,
      cost: round1(legCost),
      mass: round3(legMass),
    },
    instances,
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
