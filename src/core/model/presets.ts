import { circleIntersection } from '@/core/math/vec2';
import type { DesignDoc, Joint, LegLayout } from './types';
import { DESIGN_VERSION } from './types';

/**
 * 既知の機構のプリセット。リンク長から設計位置を計算して作る。
 * 単位は cm、クランク角 0 の姿勢。
 */

type P = { x: number; y: number };
type Pick = 'up' | 'down' | 'left' | 'right';

/** 2 円の交点のうち pick の向きにある方 */
export function dyadPoint(a: P, ra: number, b: P, rb: number, pick: Pick): P {
  const h = circleIntersection(a.x, a.y, ra, b.x, b.y, rb);
  if (!h) throw new Error('dyadPoint: circles do not intersect');
  const s = Math.sqrt(h.h2);
  const p1 = { x: h.ax + h.hx * s, y: h.ay + h.hy * s };
  const p2 = { x: h.ax - h.hx * s, y: h.ay - h.hy * s };
  const score = {
    up: (p: P) => p.y,
    down: (p: P) => -p.y,
    left: (p: P) => -p.x,
    right: (p: P) => p.x,
  }[pick];
  return score(p1) >= score(p2) ? p1 : p2;
}

function joints(points: Record<string, P>, fixedIds: string[]): Joint[] {
  return Object.entries(points).map(([id, p]) => ({
    id,
    x: round(p.x),
    y: round(p.y),
    fixed: fixedIds.includes(id),
  }));
}

/** 設計データは小数 6 桁に丸めて保存する(共有 URL を短くするため) */
const round = (v: number) => Math.round(v * 1e6) / 1e6;

/** ヤンセンリンクの「聖なる数」 */
export const JANSEN_LENGTHS = {
  a: 38.0,
  b: 41.5,
  c: 39.3,
  d: 40.1,
  e: 55.8,
  f: 39.4,
  g: 36.7,
  h: 65.7,
  i: 49.0,
  j: 50.0,
  k: 61.9,
  l: 7.8,
  m: 15.0,
} as const;

/**
 * ヤンセンリンク(片脚)。O がクランク軸、B が固定ピボット。G が脚先。
 * 時計回り(rpm < 0)に回すと +x へ歩く。
 */
export function jansenLeg(
  L: Record<keyof typeof JANSEN_LENGTHS, number> = JANSEN_LENGTHS,
  legs: LegLayout = { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false },
): DesignDoc {
  const O = { x: 0, y: 0 };
  const B = { x: -L.a, y: -L.l };
  const A = { x: L.m, y: 0 };
  const C = dyadPoint(A, L.j, B, L.b, 'up');
  const D = dyadPoint(B, L.d, C, L.e, 'left');
  const E = dyadPoint(A, L.k, B, L.c, 'down');
  const F = dyadPoint(D, L.f, E, L.g, 'left');
  const G = dyadPoint(F, L.h, E, L.i, 'down');
  return {
    version: DESIGN_VERSION,
    name: 'ヤンセンリンク',
    joints: joints({ O, B, A, C, D, E, F, G }, ['O', 'B']),
    links: [
      { id: 'crank', joints: ['O', 'A'] },
      { id: 'j', joints: ['A', 'C'] },
      { id: 'bde', joints: ['B', 'C', 'D'] },
      { id: 'k', joints: ['A', 'E'] },
      { id: 'c', joints: ['B', 'E'] },
      { id: 'f', joints: ['D', 'F'] },
      { id: 'ghi', joints: ['E', 'F', 'G'] },
    ],
    cranks: [{ id: 'motor', link: 'crank', pivot: 'O', phase: 0 }],
    foot: 'G',
    motor: { rpm: -40 },
    legs,
  };
}

/**
 * 見本機:ヤンセン脚を前後反転ペアで 6 組(計 12 脚)、120°ずらし。
 * 6 脚(3 組)だと接地する脚先が常に 2 本ほどで一直線に並び、横に倒れる(sim の検証結果)。
 * 位相 0/120/240 の組が左右に 1 つずつ来るので、常に 4 本前後が地面を支える。
 */
export function jansenWalker(): DesignDoc {
  return {
    ...jansenLeg(JANSEN_LENGTHS, { count: 6, phaseStepDeg: 120, spacing: 12, mirrorX: true }),
    name: 'ヤンセン型 見本機',
  };
}

/**
 * チェビシェフのラムダ機構(ホーケン型の配置)。
 * 地節 2、クランク 1、揺動節 2.5、カップラー 5(揺動節は中点に接続)を 10 倍した寸法。
 * 脚先 P はクランク 180°の間ほぼ直線(y ≈ -40)を描く。
 */
export function chebyshevLambda(scale = 10): DesignDoc {
  const O2 = { x: 0, y: 0 };
  const O4 = { x: 2 * scale, y: 0 };
  const A = { x: 1 * scale, y: 0 };
  const M = dyadPoint(A, 2.5 * scale, O4, 2.5 * scale, 'down');
  const Pt = { x: A.x + 2 * (M.x - A.x), y: A.y + 2 * (M.y - A.y) };
  return {
    version: DESIGN_VERSION,
    name: 'チェビシェフリンク',
    joints: joints({ O2, O4, A, M, P: Pt }, ['O2', 'O4']),
    links: [
      { id: 'crank', joints: ['O2', 'A'] },
      { id: 'coupler', joints: ['A', 'M', 'P'] },
      { id: 'rocker', joints: ['O4', 'M'] },
    ],
    cranks: [{ id: 'motor', link: 'crank', pivot: 'O2', phase: 0 }],
    foot: 'P',
    motor: { rpm: 40 },
    legs: { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false },
  };
}

/** 基本の四節リンク(てこクランク)。カップラー上の三角形の頂点を脚先にする。 */
export function fourBar(
  crank = 10,
  coupler = 35,
  rocker = 30,
  ground = 40,
  footOffset: P = { x: 5, y: -30 },
): DesignDoc {
  const O2 = { x: 0, y: 0 };
  const O4 = { x: ground, y: 0 };
  const A = { x: 0, y: crank };
  const Bp = dyadPoint(A, coupler, O4, rocker, 'up');
  const mid = { x: (A.x + Bp.x) / 2, y: (A.y + Bp.y) / 2 };
  const F = { x: mid.x + footOffset.x, y: mid.y + footOffset.y };
  return {
    version: DESIGN_VERSION,
    name: '四節リンク',
    joints: joints({ O2, O4, A, B: Bp, F }, ['O2', 'O4']),
    links: [
      { id: 'crank', joints: ['O2', 'A'] },
      { id: 'coupler', joints: ['A', 'B', 'F'] },
      { id: 'rocker', joints: ['O4', 'B'] },
    ],
    cranks: [{ id: 'motor', link: 'crank', pivot: 'O2', phase: 0 }],
    foot: 'F',
    motor: { rpm: 30 },
    legs: { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false },
  };
}

export const PRESETS = {
  jansen: jansenLeg,
  jansenWalker,
  chebyshev: chebyshevLambda,
  fourBar,
} as const;
export type PresetId = keyof typeof PRESETS;
