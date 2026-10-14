import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Walker } from './walker';
import { createFlatTerrain, createRapierTerrain } from './terrain';
import { runHeadless } from './headless';
import { jansenTwoSided } from './fixtures';
import type { TerrainCollider } from './types';

const flat = createFlatTerrain(0);
const start = { x: 0, z: 0 };

let ramp: TerrainCollider;
let rapierFlat: TerrainCollider;
beforeAll(async () => {
  // 勾配 0.15 の長い上り坂(スタートから坂の上)
  ramp = await createRapierTerrain({
    ground: { y: 0 },
    shapes: [{ kind: 'ramp', x0: -2, x1: 40, y0: 0, y1: 0.15 * 42, z0: -3, z1: 3, bottom: -1 }],
  });
  rapierFlat = await createRapierTerrain({ ground: { y: 0 }, shapes: [] });
});
afterAll(() => {
  ramp.dispose?.();
  rapierFlat.dispose?.();
});

describe('motor (SIM-3, S-04)', () => {
  it('a weak motor stalls the crank', () => {
    const sim = new Walker({
      design: jansenTwoSided(),
      terrain: flat,
      start,
      params: { motor: { stallTorque: 3 } },
    });
    for (let s = 0; s < 4 * 240; s++) sim.step();
    const snap = sim.snapshot();
    expect(snap.stalled).toBe(true);
    expect(Math.abs(snap.motorSpeed)).toBeLessThan(0.05);
    expect(Math.abs(snap.motorAngle)).toBeLessThan(0.5);
    expect(Math.abs(snap.com.x)).toBeLessThan(0.1);
    // the load torque reached the stall torque
    expect(snap.motorTorque).toBeGreaterThan(3 * 0.98);
    expect(snap.jammed).toBe(false);
  });

  it('a strong enough motor does not stall and spins near the commanded speed on flat ground', () => {
    const sim = new Walker({ design: jansenTwoSided(), terrain: flat, start });
    let stalledSteps = 0;
    for (let s = 0; s < 6 * 240; s++) {
      sim.step();
      // 最初の 0.5 秒は着地(1mm 落下)と起動の過渡で一瞬トルクが上限に届くことがある
      if (sim.time > 0.5 && sim.stalled) stalledSteps++;
    }
    expect(stalledSteps).toBe(0);
    const omega0 = (-40 * 2 * Math.PI) / 60;
    // mean speed over the run: the crank turned at > 70% of the no-load speed
    expect(sim.theta / sim.time / omega0).toBeGreaterThan(0.7);
    expect(sim.theta / sim.time / omega0).toBeLessThanOrEqual(1);
  });

  it('is slower uphill than on flat ground, and needs more torque', () => {
    const T = 10;
    const onFlat = runHeadless(
      { design: jansenTwoSided(), terrain: rapierFlat, start },
      { maxTime: T, stopOnFail: false },
    );
    const uphill = runHeadless(
      { design: jansenTwoSided(), terrain: ramp, start },
      { maxTime: T, stopOnFail: false },
    );
    expect(uphill.fallen).toBe(false);
    expect(uphill.distance).toBeGreaterThan(0.5);
    expect(uphill.distance).toBeLessThan(0.8 * onFlat.distance);
    // uphill work: energy per meter is higher
    expect(uphill.energy / uphill.distance).toBeGreaterThan(onFlat.energy / onFlat.distance);
  });

  it('lowering the stall torque reduces the speed (linear torque-speed curve)', () => {
    const dist = (stallTorque: number) =>
      runHeadless(
        { design: jansenTwoSided(), terrain: ramp, start, params: { motor: { stallTorque } } },
        { maxTime: 8, stopOnFail: false },
      ).distance;
    const strong = dist(200);
    const normal = dist(60);
    const weak = dist(35);
    expect(strong).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(weak);
  });

  it('accumulates energy only while the crank turns', () => {
    const sim = new Walker({ design: jansenTwoSided(), terrain: flat, start });
    let prev = 0;
    for (let s = 0; s < 2 * 240; s++) {
      sim.step();
      expect(sim.energy).toBeGreaterThanOrEqual(prev);
      prev = sim.energy;
    }
    expect(sim.energy).toBeGreaterThan(0);
  });

  it('caps the commanded speed at 120 rpm', () => {
    const d = { ...jansenTwoSided(), motor: { rpm: -500 } };
    const sim = new Walker({ design: d, terrain: flat, start });
    for (let s = 0; s < 240; s++) sim.step();
    expect(Math.abs(sim.thetaDot)).toBeLessThanOrEqual((120 * 2 * Math.PI) / 60 + 1e-9);
  });
});
