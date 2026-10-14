import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Walker } from './walker';
import { createFlatTerrain, createRapierTerrain } from './terrain';
import { awkwardFourBar, jansenTwoSided } from './fixtures';
import { fourBar } from '@/core/model/presets';
import { createEmptyDesign, type DesignDoc } from '@/core/model/types';
import type { SimParams, TerrainCollider } from './types';

/**
 * 頑健性(最大のリスク:さまざまな機構で接触計算が安定するか)。
 * 極端な質量・接触の硬さ・地形・壊れた設計で、数値が壊れず、速度が有界であることを確かめる。
 */

interface Outcome {
  sim: Walker;
  maxV: number;
  maxW: number;
}

function run(
  design: DesignDoc,
  seconds: number,
  terrain: TerrainCollider,
  params: Partial<SimParams> = {},
): Outcome {
  const sim = new Walker({ design, terrain, start: { x: 0, z: 0 }, params });
  let maxV = 0;
  let maxW = 0;
  for (let s = 0; s < seconds * 240; s++) {
    sim.step();
    maxV = Math.max(maxV, Math.hypot(...sim.vel));
    maxW = Math.max(maxW, Math.hypot(...sim.omega));
    if (s % 48 === 0) {
      for (const v of [...sim.com, ...sim.vel, ...sim.omega, ...sim.quat, sim.theta]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  }
  return { sim, maxV, maxW };
}

const flat = createFlatTerrain(0);
let step8: TerrainCollider;
let step12: TerrainCollider;
let wall: TerrainCollider;
let ledge: TerrainCollider;
beforeAll(async () => {
  const box = (h: number) =>
    createRapierTerrain({
      ground: { y: 0 },
      shapes: [{ kind: 'box', min: [1.2, -1, -3], max: [8, h, 3] }],
    });
  step8 = await box(0.08);
  step12 = await box(0.12);
  wall = await box(2);
  ledge = await createRapierTerrain({
    ground: { y: -0.4 },
    shapes: [{ kind: 'box', min: [-3, -1, -3], max: [1.5, 0, 3] }],
  });
});
afterAll(() => {
  for (const t of [step8, step12, wall, ledge]) t.dispose?.();
});

describe('robustness of the contact model', () => {
  it.each([
    ['light chassis (0.5 kg)', { chassisMass: 0.5 }],
    ['heavy chassis (300 kg)', { chassisMass: 300 }],
    ['soft contacts', { contactStiffness: 5000, contactDamping: 100 }],
    ['very stiff contacts', { contactStiffness: 1e6, contactDamping: 1e4 }],
    ['big feet', { footRadius: 0.1 }],
  ] as [string, Partial<SimParams>][])('%s: walks without falling', (_, params) => {
    const { sim, maxV, maxW } = run(jansenTwoSided(), 8, flat, params);
    expect(sim.fallen).toBe(false);
    expect(sim.com[0]).toBeGreaterThan(1);
    expect(maxV).toBeLessThan(3);
    expect(maxW).toBeLessThan(3);
  });

  it('cannot walk without friction (and does not drift)', () => {
    const { sim } = run(jansenTwoSided(), 5, createFlatTerrain(0, 0));
    expect(Math.abs(sim.com[0]!)).toBeLessThan(0.05);
  });

  it('climbs an 8 cm step with the default motor; a 12 cm step needs more torque', () => {
    const climbs = run(jansenTwoSided(), 12, step8).sim;
    expect(climbs.com[0]).toBeGreaterThan(3);
    expect(climbs.com[1]).toBeGreaterThan(0.7);
    const blocked = run(jansenTwoSided(), 8, step12).sim;
    expect(blocked.com[0]).toBeLessThan(2);
    expect(blocked.stalled).toBe(true);
    expect(blocked.fallen).toBe(false);
    const strong = run(jansenTwoSided(), 12, step12, { motor: { stallTorque: 150 } }).sim;
    expect(strong.com[0]).toBeGreaterThan(3);
  });

  it('stalls against a wall without pushing through it', () => {
    const { sim, maxV } = run(jansenTwoSided(), 8, wall);
    expect(sim.stalled).toBe(true);
    expect(sim.com[0]).toBeLessThan(1.2);
    expect(maxV).toBeLessThan(2);
  });

  it('walking off a 40 cm ledge is detected as a fall and stays bounded', () => {
    const { sim, maxV } = run(jansenTwoSided(), 10, ledge);
    expect(sim.com[1]).toBeGreaterThan(-0.4);
    expect(maxV).toBeLessThan(5);
  });

  it('a braced (redundant) mechanism is jammed', () => {
    const d = jansenTwoSided();
    d.links = [...d.links, { id: 'brace', joints: ['A', 'B'] }];
    const { sim } = run(d, 2, flat);
    expect(sim.jammed).toBe(true);
    expect(sim.thetaDot).toBe(0);
  });

  it('handles an empty design and a design without a crank', () => {
    const empty = run(createEmptyDesign(), 2, flat).sim;
    expect(empty.mass.total).toBeCloseTo(8, 9);
    expect(Math.hypot(...empty.vel)).toBeLessThan(1e-3);
    const noCrank = run({ ...awkwardFourBar(), cranks: [] }, 2, flat).sim;
    expect(noCrank.theta).toBe(0);
    expect(Math.hypot(...noCrank.vel)).toBeLessThan(1e-3);
  });

  it('a grid of arbitrary four-bar walkers stays finite and bounded', () => {
    const layouts = [
      { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false },
      { count: 3, phaseStepDeg: 120, spacing: 20, mirrorX: true },
      { count: 4, phaseStepDeg: 90, spacing: 15, mirrorX: false },
    ];
    let k = 0;
    for (const crank of [5, 10, 15])
      for (const coupler of [25, 50])
        for (const rocker of [20, 45])
          for (const fy of [-20, -45]) {
            const d = fourBar(crank, coupler, rocker, 40, { x: 5, y: fy });
            const design = {
              ...d,
              legs: layouts[k % 3]!,
              motor: { rpm: [120, -120, 60][k % 3]! },
            };
            k++;
            const { maxV, maxW, sim } = run(design, 6, flat);
            expect(maxV).toBeLessThan(5);
            expect(maxW).toBeLessThan(15);
            expect(sim.com[1]).toBeGreaterThan(-0.05);
            expect(sim.com[1]).toBeLessThan(1);
          }
    expect(k).toBe(24);
  });
});
