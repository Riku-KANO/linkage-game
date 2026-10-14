import { describe, expect, it } from 'vitest';
import { compileMechanism } from './compile';
import { sampleCycle, solvePose } from './solve';
import { grublerDof } from './analyze';
import { chebyshevLambda, fourBar, jansenLeg } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';

function footPath(design: DesignDoc, steps = 360) {
  const m = compileMechanism(design);
  const cyc = sampleCycle(m, steps);
  const f = m.footIndex;
  const pts = cyc.positions.map((p) => ({ x: p[f * 2]!, y: p[f * 2 + 1]! }));
  return { m, cyc, pts };
}

describe('kinematics solver', () => {
  it('reproduces the design pose at theta = 0', () => {
    for (const d of [jansenLeg(), chebyshevLambda(), fourBar()]) {
      const m = compileMechanism(d);
      const res = solvePose(m, 0);
      expect(res.ok).toBe(true);
      for (let i = 0; i < m.jointIds.length * 2; i++) {
        expect(res.positions[i]).toBeCloseTo(m.designPos[i]!, 6);
      }
    }
  });

  it('keeps every link rigid over a full rotation (Jansen)', () => {
    const d = jansenLeg();
    const { m, cyc } = footPath(d, 120);
    expect(cyc.fullRotation).toBe(true);
    for (const pos of cyc.positions) {
      m.links.forEach((ls) => {
        for (let a = 0; a < ls.length; a++)
          for (let b = a + 1; b < ls.length; b++) {
            const i = ls[a]!;
            const j = ls[b]!;
            const d0 = Math.hypot(
              m.designPos[i * 2]! - m.designPos[j * 2]!,
              m.designPos[i * 2 + 1]! - m.designPos[j * 2 + 1]!,
            );
            const d1 = Math.hypot(pos[i * 2]! - pos[j * 2]!, pos[i * 2 + 1]! - pos[j * 2 + 1]!);
            expect(Math.abs(d1 - d0)).toBeLessThan(1e-6);
          }
      });
    }
  });

  it('Jansen foot path has a long flat bottom (stride)', () => {
    const { pts } = footPath(jansenLeg());
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    // points within 0.5 cm of the lowest point form the ground-contact stroke
    const flat = pts.filter((p) => p.y < minY + 0.5);
    const stride = Math.max(...flat.map((p) => p.x)) - Math.min(...flat.map((p) => p.x));
    expect(flat.length / pts.length).toBeGreaterThan(0.3);
    expect(stride).toBeGreaterThan(35);
    expect(maxY - minY).toBeGreaterThan(20); // lifts the foot
    expect(minY).toBeCloseTo(-91.8, 0);
  });

  it('Chebyshev lambda traces a near-straight line for half a turn', () => {
    const { pts } = footPath(chebyshevLambda());
    // the straight segment is y ≈ -40 between x = 0 .. 40
    const seg = pts.filter((p) => p.x >= 0 && p.x <= 40 && p.y > -41);
    expect(seg.length / pts.length).toBeGreaterThan(0.45);
    const ys = seg.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.15);
  });

  it('keeps the assembly mode continuous (no flipping between frames)', () => {
    const { pts } = footPath(jansenLeg(), 720);
    for (let s = 1; s < pts.length; s++) {
      const a = pts[s - 1]!;
      const b = pts[s]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(2);
    }
  });

  it('detects an unassemblable mechanism', () => {
    // crank too long for a four-bar: cannot rotate fully
    const d = fourBar(28, 35, 30, 40);
    const { cyc } = footPath(d, 90);
    expect(cyc.fullRotation).toBe(false);
    expect(cyc.ok.some(Boolean)).toBe(true);
  });

  it('solves non-dyadic (Assur class 3) groups with Newton', () => {
    // ternary link T1-T2-T3 held by three bars from K1 (crank pin), K2, K3 (fixed)
    const d: DesignDoc = {
      version: 1,
      name: 'triad',
      joints: [
        { id: 'O', x: 0, y: 0, fixed: true },
        { id: 'K1', x: 5, y: 0, fixed: false },
        { id: 'K2', x: 60, y: 0, fixed: true },
        { id: 'K3', x: 30, y: 50, fixed: true },
        { id: 'T1', x: 20, y: 10, fixed: false },
        { id: 'T2', x: 40, y: 12, fixed: false },
        { id: 'T3', x: 30, y: 28, fixed: false },
      ],
      links: [
        { id: 'crank', joints: ['O', 'K1'] },
        { id: 'b1', joints: ['K1', 'T1'] },
        { id: 'b2', joints: ['K2', 'T2'] },
        { id: 'b3', joints: ['K3', 'T3'] },
        { id: 'tri', joints: ['T1', 'T2', 'T3'] },
      ],
      cranks: [{ id: 'm', link: 'crank', pivot: 'O', phase: 0 }],
      foot: 'T3',
      motor: { rpm: 30 },
      legs: { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false },
    };
    expect(grublerDof(d).dof).toBe(1);
    const m = compileMechanism(d);
    expect(m.plan.some((s) => s.kind === 'newton')).toBe(true);
    let prev: Float64Array | null = null;
    // this triad locks beyond ~30°, so sweep within its range of motion
    for (let s = 0; s <= 25; s++) {
      const res = solvePose(m, (s * Math.PI) / 180, { prev });
      expect(res.ok).toBe(true);
      expect(res.residual).toBeLessThan(1e-6);
      prev = res.positions;
    }
  });
});

describe('grubler', () => {
  it('counts DOF = 1 for the presets', () => {
    expect(grublerDof(jansenLeg()).dof).toBe(1);
    expect(grublerDof(chebyshevLambda()).dof).toBe(1);
    expect(grublerDof(fourBar()).dof).toBe(1);
  });
  it('locked triangle and loose five-bar', () => {
    const base = fourBar();
    const locked: DesignDoc = {
      ...base,
      links: [...base.links, { id: 'brace', joints: ['O2', 'B'] }],
    };
    expect(grublerDof(locked).dof).toBe(0);
    const loose: DesignDoc = {
      ...base,
      joints: [...base.joints, { id: 'X', x: 50, y: 30, fixed: false }],
      links: [
        base.links[0]!,
        { id: 'coupler', joints: ['A', 'B', 'F'] },
        { id: 'r1', joints: ['B', 'X'] },
        { id: 'r2', joints: ['X', 'O4'] },
      ],
    };
    expect(grublerDof(loose).dof).toBe(2);
  });
});
