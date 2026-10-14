import type { DesignDoc } from '@/core/model/types';
import { CM } from '@/core/model/types';
import type { LegInstance } from '@/core/sim/types';

/**
 * E-06 脚列の複製。
 * 片脚の設計を奥行き方向(z)に並べ、組ごとにクランク位相をずらす。
 * mirrorX のときは各組に前後反転した脚を足す。反転脚はクランクピンを共有する
 * (同じモーター角でピン位置が一致するよう位相を補正済みの設計を mirrorDesignX が返す)。
 */
export function legInstances(design: DesignDoc): LegInstance[] {
  const { count, phaseStepDeg, spacing, mirrorX } = design.legs;
  const groups = Math.max(1, Math.floor(count));
  const perGroup = mirrorX ? 2 : 1;
  const slots = groups * perGroup;
  const out: LegInstance[] = [];
  for (let g = 0; g < groups; g++) {
    const phase = (g * phaseStepDeg * Math.PI) / 180;
    for (let m = 0; m < perGroup; m++) {
      const k = g * perGroup + m;
      out.push({ z: (k - (slots - 1) / 2) * spacing * CM, mirrored: m === 1, phase });
    }
  }
  return out;
}

/**
 * 前後反転(x → 2·px − x)した設計。px は最初のクランクの軸の x(クランクがなければ 0)。
 * 反転後もクランクピンが元の脚と同じ位置に来るよう、クランク位相を 2φ0 − π だけ補正する。
 */
export function mirrorDesignX(design: DesignDoc): DesignDoc {
  const byId = new Map(design.joints.map((j) => [j.id, j]));
  const firstPivot = design.cranks[0] ? byId.get(design.cranks[0].pivot) : undefined;
  const px = firstPivot?.x ?? 0;
  const cranks = design.cranks.map((c) => {
    const pivot = byId.get(c.pivot);
    const link = design.links.find((l) => l.id === c.link);
    const pinId = link?.joints.find((id) => id !== c.pivot);
    const pin = pinId ? byId.get(pinId) : undefined;
    if (!pivot || !pin) return { ...c };
    const phi0 = Math.atan2(pin.y - pivot.y, pin.x - pivot.x);
    return { ...c, phase: c.phase + 2 * phi0 - Math.PI };
  });
  return {
    ...design,
    joints: design.joints.map((j) => ({ ...j, x: 2 * px - j.x })),
    cranks,
  };
}
