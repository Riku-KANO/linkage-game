import type { DesignDoc, Joint, Link } from '@/core/model/types';
import { DESIGN_VERSION } from '@/core/model/types';
import { dyadPoint } from '@/core/model/presets';

/**
 * テスト用の小さな機構(四節リンクなど)を作る。
 * 座標は cm、設計データと同じく小数 6 桁に丸める。
 */

const round = (v: number) => Math.round(v * 1e6) / 1e6;

export interface FourBarSpec {
  ground: number;
  crank: number;
  coupler: number;
  rocker: number;
  /** 設計姿勢でのクランクの向き(度、+x から反時計回り) */
  crankDeg?: number;
  /** 2 円の交点のどちらを使うか */
  pick?: 'up' | 'down';
}

/**
 * 四節リンク O2(固定)─ A ─ B ─ O4(固定)。リンク id は crank / coupler / rocker。
 * O2 = (0, 0)、O4 = (ground, 0)。
 */
export function makeFourBar(spec: FourBarSpec): DesignDoc {
  const { ground, crank, coupler, rocker } = spec;
  const rad = ((spec.crankDeg ?? 90) * Math.PI) / 180;
  const A = { x: crank * Math.cos(rad), y: crank * Math.sin(rad) };
  const B = dyadPoint(A, coupler, { x: ground, y: 0 }, rocker, spec.pick ?? 'up');
  const joints: Joint[] = [
    { id: 'O2', x: 0, y: 0, fixed: true },
    { id: 'O4', x: ground, y: 0, fixed: true },
    { id: 'A', x: round(A.x), y: round(A.y), fixed: false },
    { id: 'B', x: round(B.x), y: round(B.y), fixed: false },
  ];
  const links: Link[] = [
    { id: 'crank', joints: ['O2', 'A'] },
    { id: 'coupler', joints: ['A', 'B'] },
    { id: 'rocker', joints: ['O4', 'B'] },
  ];
  return {
    version: DESIGN_VERSION,
    name: 'test four-bar',
    joints,
    links,
    cranks: [{ id: 'motor', link: 'crank', pivot: 'O2', phase: 0 }],
    foot: 'B',
    motor: { rpm: 30 },
    legs: { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false },
  };
}

/** 設計にジョイントとリンクを足した新しい設計を返す */
export function withParts(
  design: DesignDoc,
  parts: { joints?: Joint[]; links?: Link[]; removeLinks?: string[] },
): DesignDoc {
  const remove = new Set(parts.removeLinks ?? []);
  return {
    ...design,
    joints: [...design.joints, ...(parts.joints ?? [])],
    links: [...design.links.filter((l) => !remove.has(l.id)), ...(parts.links ?? [])],
  };
}
