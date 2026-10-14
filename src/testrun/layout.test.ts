import { describe, expect, it } from 'vitest';
import { chebyshevLambda, fourBar, jansenLeg, jansenWalker } from '@/core/model/presets';
import { CM } from '@/core/model/types';
import { mirrorDesignX } from '@/core/kinematics/legs';
import { assignLinkLayers, buildMachineLayout, machineRadius, plateOutline } from './layout';
import { signedArea } from './hull';

describe('assignLinkLayers', () => {
  it('puts links sharing a joint on different layers', () => {
    const links = [[0, 1], [1, 2], [2, 0], [3]];
    const l = assignLinkLayers(links);
    expect(l[0]).not.toBe(l[1]);
    expect(l[1]).not.toBe(l[2]);
    expect(l[0]).not.toBe(l[2]);
    expect(l[3]).toBe(-1);
  });
});

describe('buildMachineLayout', () => {
  const design = jansenWalker();
  const layout = buildMachineLayout(design);

  it('splits Jansen links into 5 bars and 2 plates', () => {
    expect(layout.bars).toHaveLength(5);
    expect(layout.plates).toHaveLength(2);
    expect(layout.bars.filter((b) => b.crank)).toHaveLength(1);
    expect(layout.plates.map((p) => layout.linkIds[p.link]).sort()).toEqual(['bde', 'ghi']);
  });

  it('never stacks links that share a joint on the same layer', () => {
    const links = design.links.map((l) => l.joints);
    for (let a = 0; a < links.length; a++) {
      for (let b = a + 1; b < links.length; b++) {
        if (links[a]!.some((j) => links[b]!.includes(j))) {
          expect(layout.linkLayer[a]).not.toBe(layout.linkLayer[b]);
        }
      }
    }
  });

  it('keeps the link stack inside one leg slot', () => {
    const stack =
      layout.layerCount * (layout.layerZ.length > 1 ? layout.layerZ[1]! - layout.layerZ[0]! : 0);
    expect(stack).toBeLessThanOrEqual(layout.slot * 0.7 + 1e-9);
    expect(layout.slot).toBeCloseTo(design.legs.spacing * CM);
    expect(layout.barThickness).toBeGreaterThan(0);
  });

  it('pins reach through every attached link layer', () => {
    const idOf = (j: number) => design.joints[j]!.id;
    for (const pin of layout.pins) {
      design.links.forEach((l, li) => {
        if (!l.joints.includes(idOf(pin.joint))) return;
        const z = layout.layerZ[layout.linkLayer[li]!]!;
        expect(pin.zMin).toBeLessThan(z - layout.barThickness / 2);
        expect(pin.zMax).toBeGreaterThan(z + layout.barThickness / 2);
      });
    }
    expect(layout.pins).toHaveLength(design.joints.length);
  });

  it('places frame plates between leg slots and the motor on the crank pivot', () => {
    // 見本機は左右両側 12 脚(6 組 × 前後反転)。枠板は脚の間と両端に 1 枚ずつ
    expect(layout.instances).toHaveLength(12);
    expect(layout.frameZ).toHaveLength(13);
    const zs = layout.instances.map((i) => i.z).sort((a, b) => a - b);
    const half = (layout.layerCount * (layout.layerZ[1]! - layout.layerZ[0]!)) / 2;
    for (const fz of layout.frameZ) {
      for (const z of zs) expect(Math.abs(fz - z)).toBeGreaterThan(half);
    }
    expect(design.joints[layout.motorJoint]!.id).toBe('O');
    expect(layout.fixedJoints.map((j) => design.joints[j]!.id).sort()).toEqual(['B', 'O']);
    expect(signedArea(layout.frameOutline)).toBeGreaterThan(0);
    expect(layout.shaftZ[0]).toBeLessThan(zs[0]!);
    expect(layout.shaftZ[1]).toBeGreaterThan(zs[zs.length - 1]!);
  });

  it('extent includes the mirrored legs', () => {
    const m = mirrorDesignX(design);
    const maxX = Math.max(...m.joints.map((j) => j.x)) * CM;
    expect(layout.extent.xMax).toBeCloseTo(maxX);
    expect(machineRadius(layout)).toBeGreaterThan(0.5);
  });

  it('handles single-leg presets', () => {
    for (const d of [chebyshevLambda(), fourBar(), jansenLeg()]) {
      const l = buildMachineLayout(d);
      expect(l.instances).toHaveLength(1);
      expect(l.frameZ).toHaveLength(2);
      expect(l.bars.length + l.plates.length).toBe(d.links.length);
    }
  });

  it('handles an empty design', () => {
    const l = buildMachineLayout({ ...fourBar(), joints: [], links: [], cranks: [], foot: null });
    expect(l.bars).toHaveLength(0);
    expect(l.motorJoint).toBe(-1);
    expect(l.frameOutline).toHaveLength(0);
    expect(Number.isFinite(machineRadius(l))).toBe(true);
  });
});

describe('plateOutline', () => {
  it('wraps the plate joints with a margin (CCW, also for mirrored designs)', () => {
    const d = jansenLeg();
    const plate = d.links.find((l) => l.id === 'ghi')!;
    const idx = plate.joints.map((id) => d.joints.findIndex((j) => j.id === id));
    for (const variant of [d, mirrorDesignX(d)]) {
      const pos = new Float64Array(variant.joints.flatMap((j) => [j.x, j.y]));
      const out = plateOutline(pos, idx, 0.015);
      expect(signedArea(out)).toBeGreaterThan(0);
      expect(out.length).toBeGreaterThan(10);
    }
  });
});
