import { chebyshevLambda, fourBar, jansenWalker } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';

/**
 * 歩行の検証用の機体(SIM-5:ヤンセン型・チェビシェフ型・不格好な自作機構)。
 * テストと `?dev=sim` のプレイグラウンドで共有する。
 */

/**
 * ヤンセン型の両側版(12 脚)。`jansenWalker()` の脚列を 2 倍(3 位相 × 前後反転 × 左右)にしたもの。
 *
 * `jansenWalker()`(6 脚、片側だけ)は、どの瞬間も接地しているのが前脚 1 本と後脚 1 本だけで、
 * 支持が「線」になるため静的に不安定(物理的にも転ぶ)。左右に同じ位相の脚を置くと
 * 支持が四角形になり、重心が常にその中に入る。
 */
export function jansenTwoSided(): DesignDoc {
  return {
    ...jansenWalker(),
    name: 'ヤンセン型 両側 12 脚',
    legs: { count: 6, phaseStepDeg: 120, spacing: 12, mirrorX: true },
  };
}

/** チェビシェフ型(ラムダ機構)を 4 組、90°ずらし。直線区間が上側なので膨らんだ側で接地する */
export function chebyshevWalker(): DesignDoc {
  return {
    ...chebyshevLambda(),
    name: 'チェビシェフ型 4 脚',
    legs: { count: 4, phaseStepDeg: 90, spacing: 20, mirrorX: false },
  };
}

/** 不格好な自作機構:四節リンクのカップラー点を脚にして 3 組・前後反転 */
export function awkwardFourBar(): DesignDoc {
  return {
    ...fourBar(),
    name: '不格好な四節 6 脚',
    legs: { count: 3, phaseStepDeg: 120, spacing: 25, mirrorX: true },
  };
}

/** クランクが一回転できない四節(非グラスホフ)。途中で組立不能になる */
export function jammingFourBar(): DesignDoc {
  return { ...fourBar(15, 20, 20, 30), name: '回り切らない四節' };
}
