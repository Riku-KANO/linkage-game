import type { DesignDoc } from '@/core/model/types';
import { CM } from '@/core/model/types';
import { compileMechanism, solvePose, type CompiledMechanism } from '@/core/kinematics';
import { legInstances, mirrorDesignX } from '@/core/kinematics/legs';
import type { LegInstance } from '@/core/sim/types';
import { DEFAULT_SIM_PARAMS } from '@/core/sim/types';
import { createLegSolver } from '@/testrun/legs';
import { smoothstep } from './timeline';

/**
 * 組み上げ演出の脚の姿勢(純粋な計算)。
 *
 * 複製のとき、各組は「図面の姿勢(設計位置)」から「試走の最初の姿勢(モーター角 θ = 0 で
 * その組の位相まで回した姿勢)」まで、クランクを実際に回して運動学で解いた姿勢をたどる
 * (棒が伸び縮みしない)。演出の開始時に一度だけ解いて表にしておき、毎フレームは線形補間するだけ。
 * 表の両端は設計位置と、試走のシミュレーションが最初に解くのと同じ姿勢(createLegSolver の solve(0))に
 * 一致させる(ずれは表全体になめらかに配る)。
 */

export interface LegSweeps {
  instances: LegInstance[];
  /** 1 組あたりの値の数(ジョイント数 × 2) */
  n2: number;
  samples: number;
  /** 組ごとの姿勢の表(cm、samples × n2) */
  table: Float64Array[];
  /** 組ごとの最初(設計位置。反転した組は反転した設計の位置) */
  start: Float64Array[];
  /** 組ごとの最後(θ = 0 の姿勢) */
  end: Float64Array[];
  /** 反転の軸 x(cm、最初のクランクの軸。なければ 0) */
  mirrorAxis: number;
  /** θ = 0 の全組で最も低い点の y(m、機体ローカル) */
  restMinY: number;
}

/** -π..π に丸める */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
}

function firstCrankPhase(mech: CompiledMechanism): number {
  for (const s of mech.plan) if (s.kind === 'crank') return s.phase;
  return 0;
}

export function buildLegSweeps(design: DesignDoc, samples = 24): LegSweeps {
  const instances = legInstances(design);
  const normal = compileMechanism(design);
  const mirroredDesign = instances.some((i) => i.mirrored) ? mirrorDesignX(design) : null;
  const mirrored = mirroredDesign ? compileMechanism(mirroredDesign) : null;
  const n2 = design.joints.length * 2;
  const S = Math.max(2, Math.floor(samples));
  // 試走の最初の姿勢:シミュレーションと同じ解き方
  const solver = createLegSolver(design);
  solver.solve(0);
  const end = solver.positions.map((p) => Float64Array.from(p));
  const table: Float64Array[] = [];
  const start: Float64Array[] = [];
  let restMinY = Infinity;
  instances.forEach((inst, k) => {
    const mech = inst.mirrored && mirrored ? mirrored : normal;
    const s0 = Float64Array.from(mech.designPos);
    start.push(s0);
    const a0 = -firstCrankPhase(mech);
    const a1 = a0 + wrapAngle(inst.phase - a0);
    const tab = new Float64Array(S * n2);
    let prev: Float64Array | null = null;
    for (let i = 0; i < S; i++) {
      const out = tab.subarray(i * n2, (i + 1) * n2);
      const res = solvePose(mech, a0 + ((a1 - a0) * i) / (S - 1), { prev, out });
      if (!res.ok) {
        // 解けない角度(死点など):直前の姿勢のまま
        out.set(prev ?? s0);
      } else if (res.positions !== out) out.set(res.positions);
      prev = out;
    }
    // 両端を設計位置と試走の最初の姿勢にそろえる(ずれを表全体になめらかに配る)
    const e = end[k] ?? tab.subarray((S - 1) * n2);
    const d0 = new Float64Array(n2);
    const d1 = new Float64Array(n2);
    for (let j = 0; j < n2; j++) {
      d0[j] = s0[j]! - tab[j]!;
      d1[j] = e[j]! - tab[(S - 1) * n2 + j]!;
    }
    for (let i = 0; i < S; i++) {
      const w = smoothstep(0, 1, i / (S - 1));
      for (let j = 0; j < n2; j++)
        tab[i * n2 + j] = tab[i * n2 + j]! + (1 - w) * d0[j]! + w * d1[j]!;
    }
    table.push(tab);
    for (let j = 1; j < n2; j += 2) restMinY = Math.min(restMinY, e[j]! * CM);
  });
  const pivotId = design.cranks[0]?.pivot;
  const pivot = pivotId ? design.joints.find((j) => j.id === pivotId) : undefined;
  return {
    instances,
    n2,
    samples: S,
    table,
    start,
    end,
    mirrorAxis: pivot?.x ?? 0,
    restMinY: Number.isFinite(restMinY) ? restMinY : 0,
  };
}

/** 組 k の、複製の進み具合 s(0..1)での姿勢(cm)を out に書く */
export function sampleSweep(sw: LegSweeps, k: number, s: number, out: Float64Array): Float64Array {
  const tab = sw.table[k];
  if (!tab) return out;
  const n2 = sw.n2;
  const x = (s <= 0 ? 0 : s >= 1 ? 1 : s) * (sw.samples - 1);
  const i = Math.min(sw.samples - 2, Math.floor(x));
  const f = x - i;
  const a = i * n2;
  const b = a + n2;
  for (let j = 0; j < n2; j++) out[j] = tab[a + j]! + (tab[b + j]! - tab[a + j]!) * f;
  return out;
}

/**
 * 試走コースに置いたときの機体の高さ(m):θ = 0 の姿勢で最も低い点が、地面から脚先の半径だけ上に来る
 * (簡易シミュレーションの最初の置き方と同じ)。
 */
export function restingBodyY(sw: LegSweeps, groundY: number): number {
  return groundY + DEFAULT_SIM_PARAMS.footRadius - sw.restMinY;
}
