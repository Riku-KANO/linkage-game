import { describe, expect, it } from 'vitest';
import { createFlatTerrain } from './terrain';
import { createWalkerSim } from './walker';
import type { DesignDoc } from '@/core/model/types';

/** KIN-7:変位点を通る脚(平行四辺形)でも、試走中に組立モードが飛ばない・詰まらない */
function parallelogramLeg(extraLink: boolean): DesignDoc {
  return {
    version: 1,
    name: '平行四辺形の脚',
    motor: { rpm: -60 },
    legs: { count: 6, phaseStepDeg: 120, spacing: 12, mirrorX: false },
    foot: 'F',
    joints: [
      { id: 'O2', x: 0, y: 0, fixed: true },
      { id: 'O4', x: 40, y: 0, fixed: true },
      { id: 'O6', x: 20, y: 0, fixed: true },
      { id: 'A', x: 0, y: 10, fixed: false },
      { id: 'B', x: 40, y: 10, fixed: false },
      { id: 'C', x: 20, y: 10, fixed: false },
      { id: 'F', x: 20, y: -50, fixed: false },
    ],
    links: [
      { id: 'crank', joints: ['O2', 'A'] },
      { id: 'coupler', joints: ['A', 'C', 'B', 'F'] },
      { id: 'rocker', joints: ['O4', 'B'] },
      ...(extraLink ? [{ id: 'mid', joints: ['O6', 'C'] }] : []),
    ],
    cranks: [{ id: 'm', link: 'crank', pivot: 'O2', phase: 0 }],
  };
}

describe('change points during a test run (KIN-7)', () => {
  for (const extra of [false, true]) {
    it(`${extra ? 'double' : 'single'} parallelogram legs keep their shape and never jam`, () => {
      const sim = createWalkerSim({
        design: parallelogramLeg(extra),
        terrain: createFlatTerrain(0),
        start: { x: 0, z: 0 },
      });
      // joint order: O2, O4, O6, A, B, C, F → A = 3, B = 4
      for (let s = 0; s < 240 * 4; s++) {
        sim.step();
        if (s % 12 !== 0) continue;
        const snap = sim.snapshot();
        expect(snap.jammed).toBe(false);
        for (const p of snap.legPositions) {
          expect(p[4 * 2]! - p[3 * 2]!).toBeCloseTo(40, 4);
          expect(p[4 * 2 + 1]! - p[3 * 2 + 1]!).toBeCloseTo(0, 4);
        }
      }
      // the crank really turned through the change points (more than one turn)
      expect(Math.abs(sim.snapshot().motorAngle)).toBeGreaterThan(2 * Math.PI);
    });
  }
});
