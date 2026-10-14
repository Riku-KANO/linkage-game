import type { MechanismAnalysis } from '@/core/kinematics/analyze';

/**
 * 脚先の軌道から、ゲームの判定に使う最小限の量を取り出す(cm、設計座標)。
 * 詳しい軌道の指標(歩幅・平らさ・デューティ比)は kinematics の担当なので、ここでは
 * 「どちら向きに歩くか」「どこで地面につくか」だけを見る。
 */
export interface FootStance {
  /** 脚先の最下点の y(cm) */
  minY: number;
  /** 足上げの高さ(cm):軌道の最高点 − 最下点 */
  lift: number;
  /** 接地区間(最下点から band 以内)の x の範囲(cm) */
  stanceMinX: number;
  stanceMaxX: number;
  /**
   * モーター角 θ が増える向き(反時計回り)に回したとき、接地区間で脚先が x 方向に動く量(cm)。
   * 正なら脚先が +x へ動く = 機体は −x へ進む。
   */
  stanceDx: number;
}

/**
 * 脚先の接地区間を求める。脚先がない・一回転できないときは null。
 * band:最下点からこの高さ(cm)以内を接地区間とみなす。
 */
export function footStance(analysis: MechanismAnalysis, band = 1): FootStance | null {
  const f = analysis.compiled.footIndex;
  const { cycle } = analysis;
  if (f < 0 || !cycle.fullRotation || cycle.positions.length < 3) return null;
  const xs = cycle.positions.map((p) => p[f * 2]!);
  const ys = cycle.positions.map((p) => p[f * 2 + 1]!);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const y of ys) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const limit = minY + band;
  let stanceMinX = Infinity;
  let stanceMaxX = -Infinity;
  let stanceDx = 0;
  const n = xs.length;
  for (let i = 0; i < n; i++) {
    if (ys[i]! > limit) continue;
    stanceMinX = Math.min(stanceMinX, xs[i]!);
    stanceMaxX = Math.max(stanceMaxX, xs[i]!);
    const k = (i + 1) % n;
    if (ys[k]! <= limit) stanceDx += xs[k]! - xs[i]!;
  }
  return { minY, lift: maxY - minY, stanceMinX, stanceMaxX, stanceDx };
}

/**
 * モーターの回転の向き(rpm の符号)で、機体が進む向き。+1 前進、-1 後退、0 判定できない。
 * 前後反転した脚もクランクピンを共有するので同じ向きに進む(mirrorDesignX を参照)。
 */
export function walkDirection(stance: FootStance, rpm: number, minDx = 1): -1 | 0 | 1 {
  if (rpm === 0 || Math.abs(stance.stanceDx) < minDx) return 0;
  return stance.stanceDx * Math.sign(rpm) < 0 ? 1 : -1;
}
