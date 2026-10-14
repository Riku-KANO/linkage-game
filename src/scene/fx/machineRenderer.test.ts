import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { CM, createEmptyDesign } from '@/core/model/types';
import { jansenLeg, jansenWalker } from '@/core/model/presets';
import { createLegSolver } from '@/testrun/legs';
import { paperBodyPosition } from './crane';
import { createTrackPose, FxMachineRenderer } from './machineRenderer';
import { ASSEMBLY_PHASES } from './timeline';

function setup(design = jansenWalker()) {
  const r = new FxMachineRenderer();
  const m = r.setDesign(design);
  const track = createTrackPose();
  track.position[0] = -6.5;
  track.position[1] = 0.95;
  track.position[2] = -14;
  return { r, m, track };
}

const isZero = (arr: ArrayLike<number>, i: number) => {
  for (let k = 0; k < 16; k++) if (arr[i * 16 + k] !== 0) return false;
  return true;
};

describe('FxMachineRenderer', () => {
  it('starts as the drawing: one leg lying on the paper, the copies hidden', () => {
    const { r, m, track } = setup();
    r.update(0, track, true);
    const B = paperBodyPosition(r.crane.paper, m.frame.hingeY, 0, [0, 0, 0]);
    expect(r.pose.scale).toBeCloseTo(r.crane.paper.metersPerCm / CM, 9);
    r.pose.position.forEach((v, i) => expect(v).toBeCloseTo(B[i]!, 9));
    const nb = m.layout.bars.length;
    const bars = m.bars!.instanceMatrix.array;
    for (let k = 0; k < m.K; k++) {
      for (let bi = 0; bi < nb; bi++) {
        expect(isZero(bars, k * nb + bi)).toBe(k !== m.plan.primary);
      }
    }
    // ピンはまだない
    const pins = m.pins!.instanceMatrix.array;
    for (let i = 0; i < m.K * m.layout.pins.length; i++) expect(isZero(pins, i)).toBe(true);
  });

  it('ends exactly in the test-run pose: same parts, same matrices as MachineModel at θ = 0', () => {
    const design = jansenWalker();
    const { r, m, track } = setup(design);
    const solver = createLegSolver(design);
    solver.solve(0);
    track.legs = solver.positions.map((p) => Float64Array.from(p));
    r.setTrack(track);
    r.update(1, track, true);
    r.pose.position.forEach((v, i) => expect(v).toBeCloseTo(track.position[i]!, 9));
    expect(r.pose.scale).toBe(1);
    const { layout } = m;
    const nb = layout.bars.length;
    const w = layout.barWidth;
    const t = layout.barThickness;
    const got = new Matrix4();
    for (let k = 0; k < m.K; k++) {
      const pos = track.legs[k]!;
      const z0 = layout.instances[k]!.z;
      for (let bi = 0; bi < nb; bi++) {
        const bar = layout.bars[bi]!;
        const ax = pos[bar.a * 2]! * CM;
        const ay = pos[bar.a * 2 + 1]! * CM;
        const bx = pos[bar.b * 2]! * CM;
        const by = pos[bar.b * 2 + 1]! * CM;
        const L = Math.hypot(bx - ax, by - ay);
        const c = (bx - ax) / L;
        const s = (by - ay) / L;
        // MachineModel の writeMat と同じ値
        const want = [
          c * L,
          s * L,
          0,
          0,
          -s * w,
          c * w,
          0,
          0,
          0,
          0,
          t,
          0,
          (ax + bx) / 2,
          (ay + by) / 2,
          z0 + layout.layerZ[bar.layer]!,
          1,
        ];
        got.fromArray(m.bars!.instanceMatrix.array, (k * nb + bi) * 16);
        got.elements.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 5));
      }
    }
    // 胴体と脚先もそろっている
    for (const mesh of [m.pins!, m.feet!, m.frames!, m.shafts!]) {
      for (let i = 0; i < mesh.count; i++) expect(isZero(mesh.instanceMatrix.array, i)).toBe(false);
    }
  });

  it('assembles in order: parts, copies, chassis', () => {
    const { r, m, track } = setup();
    const P = ASSEMBLY_PHASES;
    r.update((P.duplicate.start + P.duplicate.end) / 2, track, true);
    const visible = Array.from(
      { length: m.K },
      (_, k) => !isZero(m.bars!.instanceMatrix.array, k * m.layout.bars.length),
    );
    expect(visible.filter(Boolean).length).toBeGreaterThan(1);
    expect(visible.filter(Boolean).length).toBeLessThan(m.K);
    expect(isZero(m.frames!.instanceMatrix.array, 0)).toBe(true);
    r.update(P.chassis.end, track, true);
    expect(isZero(m.frames!.instanceMatrix.array, 0)).toBe(false);
  });

  it('does not break on an empty or single-leg design', () => {
    const { r, track } = setup(createEmptyDesign());
    for (const u of [0, 0.5, 1]) r.update(u, track, true);
    expect(r.root.visible).toBe(false);
    const one = setup(jansenLeg());
    for (const u of [0, 0.3, 0.6, 1]) one.r.update(u, one.track, true);
    expect(one.r.root.visible).toBe(true);
    one.r.pose.position.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});
