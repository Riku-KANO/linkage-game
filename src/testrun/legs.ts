import type { DesignDoc } from '@/core/model/types';
import type { LegInstance } from '@/core/sim/types';
import { compileMechanism, solvePose, type CompiledMechanism } from '@/core/kinematics';
import { legInstances, mirrorDesignX } from '@/core/kinematics/legs';

/**
 * 脚列の全組をモーター角から解く(試走ビューのプレビュー・ゴースト・設計ビュー縮小版で共有)。
 *
 * 組ごとに前回の解を prev として渡し、組立モードを連続に保つ(S-02)。出力は 2 枚のバッファを
 * 交互に使うので、solve() のたびに positions を読み直すこと。
 * main の `compileLegSet` / `solveLegInstances`(kinematics)と同じ役割。統合時に置き換えやすいよう
 * ここだけに閉じ込めてある。
 */
export interface LegSolver {
  readonly instances: readonly LegInstance[];
  /** 組ごとの解法プラン(反転した組は反転した設計) */
  readonly mechs: readonly CompiledMechanism[];
  /** 通常の脚と反転した脚の解法プラン */
  readonly normal: CompiledMechanism;
  readonly mirrored: CompiledMechanism | null;
  /** 組ごとの最新の位置(cm、[x0, y0, ...])。solve のたびに入れ替わる */
  readonly positions: readonly Float64Array[];
  /** 全組を角度 theta(rad)で解く。全組が組み立てられたら true */
  solve(theta: number): boolean;
  /** 前回の解を忘れる(次の solve は設計姿勢の向きで解く) */
  reset(): void;
}

export function createLegSolver(design: DesignDoc): LegSolver {
  const instances = legInstances(design);
  const normal = compileMechanism(design);
  const mirrored = instances.some((i) => i.mirrored)
    ? compileMechanism(mirrorDesignX(design))
    : null;
  const mechs = instances.map((i) => (i.mirrored && mirrored ? mirrored : normal));
  const n2 = normal.jointIds.length * 2;
  const bufA = instances.map(() => new Float64Array(n2));
  const bufB = instances.map(() => new Float64Array(n2));
  const positions: Float64Array[] = bufA.slice();
  let hasPrev = false;

  return {
    instances,
    mechs,
    normal,
    mirrored,
    positions,
    solve(theta) {
      let ok = true;
      for (let k = 0; k < instances.length; k++) {
        const prev = positions[k]!;
        const out = prev === bufA[k] ? bufB[k]! : bufA[k]!;
        const res = solvePose(mechs[k]!, theta + instances[k]!.phase, {
          prev: hasPrev ? prev : null,
          out,
        });
        if (!res.ok) ok = false;
        positions[k] = res.positions;
      }
      hasPrev = true;
      return ok;
    },
    reset() {
      hasPrev = false;
    },
  };
}
