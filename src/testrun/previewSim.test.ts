import { describe, expect, it } from 'vitest';
import { chebyshevLambda, fourBar, jansenWalker } from '@/core/model/presets';
import { compileMechanism, solvePose } from '@/core/kinematics';
import { mirrorDesignX } from '@/core/kinematics/legs';
import type { SimSnapshot, TerrainSpec } from '@/core/sim/types';
import { createKinematicPreviewSim, estimateStride } from './previewSim';
import { tiltFromQuat } from './slowmo';

const STEPS_PER_S = 240;

function stepN(sim: { step(): void }, n: number) {
  for (let i = 0; i < n; i++) sim.step();
}

/** スナップショットの値を比較用の素の値に写す(再利用オブジェクトなのでコピーが要る) */
function freeze(s: SimSnapshot) {
  return JSON.parse(
    JSON.stringify({ ...s, legPositions: s.legPositions.map((p) => Array.from(p)) }),
  ) as unknown;
}

describe('estimateStride', () => {
  it('Jansen: long stride, walks +x when turning clockwise', () => {
    const e = estimateStride(jansenWalker());
    expect(e.stride).toBeGreaterThan(0.35);
    expect(e.speed).toBeGreaterThan(0.1);
    expect(e.speed).toBeLessThan(2);
  });

  it('caps the glide speed for feet with a short contact', () => {
    for (const d of [chebyshevLambda(), fourBar()]) {
      const e = estimateStride(d);
      const revPerSec = Math.abs(d.motor.rpm) / 60;
      expect(Math.abs(e.speed)).toBeLessThanOrEqual((e.stride * revPerSec) / 0.25 + 1e-9);
    }
  });

  it('a stopped motor does not walk', () => {
    expect(estimateStride({ ...jansenWalker(), motor: { rpm: 0 } }).speed).toBe(0);
  });
});

describe('createKinematicPreviewSim', () => {
  it('walks forward on flat ground at the estimated speed without sinking', () => {
    const d = jansenWalker();
    const sim = createKinematicPreviewSim(d);
    const s0 = sim.snapshot();
    const x0 = s0.body.position.x;
    const { speed } = estimateStride(d);
    for (let t = 0; t < 10 * STEPS_PER_S; t++) {
      sim.step();
      if (t % 24 === 0) {
        const s = sim.snapshot();
        let touching = 0;
        for (const c of s.contacts) {
          expect(c.position.y).toBeGreaterThan(sim.params.footRadius - 0.002);
          if (c.contact) touching++;
        }
        expect(touching).toBeGreaterThan(0);
        expect(s.fallen).toBe(false);
        expect(tiltFromQuat(s.body.quaternion)).toBeLessThan(0.05);
      }
    }
    const s = sim.snapshot();
    expect(s.time).toBeCloseTo(10, 6);
    expect(s.body.position.x - x0).toBeCloseTo(speed * 10, 1);
    expect(s.motorAngle).toBeCloseTo((d.motor.rpm * 2 * Math.PI * 10) / 60, 6);
    expect(s.energy).toBeGreaterThan(0);
  });

  it('reports leg poses that match the kinematics for every instance (mirrored too)', () => {
    const d = jansenWalker();
    const sim = createKinematicPreviewSim(d);
    stepN(sim, 333);
    const s = sim.snapshot();
    expect(s.instances).toHaveLength(12);
    expect(s.legPositions).toHaveLength(12);
    expect(s.contacts).toHaveLength(12 * d.joints.length);
    const normal = compileMechanism(d);
    const mirrored = compileMechanism(mirrorDesignX(d));
    s.instances.forEach((inst, k) => {
      const mech = inst.mirrored ? mirrored : normal;
      const ref = solvePose(mech, s.motorAngle + inst.phase, { prev: s.legPositions[k]! });
      for (let i = 0; i < ref.positions.length; i++) {
        expect(s.legPositions[k]![i]).toBeCloseTo(ref.positions[i]!, 6);
      }
    });
  });

  it('is deterministic and reset returns to the initial state', () => {
    const a = createKinematicPreviewSim(jansenWalker());
    const b = createKinematicPreviewSim(jansenWalker());
    const initial = freeze(a.snapshot());
    stepN(a, 1000);
    stepN(b, 1000);
    expect(freeze(a.snapshot())).toEqual(freeze(b.snapshot()));
    a.reset();
    expect(freeze(a.snapshot())).toEqual(initial);
    stepN(a, 1000);
    expect(freeze(a.snapshot())).toEqual(freeze(b.snapshot()));
  });

  it('climbs onto a step and the load torque rises while climbing', () => {
    const course: TerrainSpec = {
      ground: null,
      shapes: [
        { kind: 'box', min: [-3, -0.5, -1], max: [3, 0, 1] },
        { kind: 'box', min: [3, -0.5, -1], max: [9, 0.06, 1] },
      ],
    };
    const sim = createKinematicPreviewSim(jansenWalker(), course);
    const y0 = sim.snapshot().body.position.y;
    let flatTorque = 0;
    let maxTorque = 0;
    for (let t = 0; t < 8 * STEPS_PER_S; t++) {
      sim.step();
      const s = sim.snapshot();
      if (s.time > 1 && s.time < 2) flatTorque = Math.max(flatTorque, s.motorTorque);
      maxTorque = Math.max(maxTorque, s.motorTorque);
    }
    const s = sim.snapshot();
    expect(s.body.position.x).toBeGreaterThan(5);
    expect(s.body.position.y - y0).toBeCloseTo(0.06, 2);
    expect(maxTorque).toBeGreaterThan(flatTorque * 1.5);
    expect(s.fallen).toBe(false);
  });

  it('tips over on request (fall demo for the slow-motion)', () => {
    const sim = createKinematicPreviewSim(jansenWalker(), undefined, { tipOverAt: 1 });
    stepN(sim, STEPS_PER_S);
    expect(sim.snapshot().fallen).toBe(false);
    stepN(sim, 3 * STEPS_PER_S);
    const s = sim.snapshot();
    expect(s.fallen).toBe(true);
    expect(tiltFromQuat(s.body.quaternion)).toBeGreaterThanOrEqual(sim.params.fallTilt);
    // 倒れたらモーターは止まる
    const angle = s.motorAngle;
    stepN(sim, 100);
    expect(sim.snapshot().motorAngle).toBe(angle);
    for (const c of sim.snapshot().contacts) expect(Number.isFinite(c.position.y)).toBe(true);
  });

  it('stalls when the motor torque limit is too low', () => {
    const sim = createKinematicPreviewSim(jansenWalker(), undefined, {
      params: { motor: { stallTorque: 1 } },
    });
    stepN(sim, 2 * STEPS_PER_S);
    const s = sim.snapshot();
    expect(s.stalled).toBe(true);
    const x = s.body.position.x;
    stepN(sim, STEPS_PER_S);
    expect(sim.snapshot().body.position.x).toBe(x);
  });

  it('jams (and stays finite) when the crank cannot turn all the way', () => {
    // 非グラスホフの四節(s + l > p + q):クランクが一回転できない
    const d = fourBar(15, 20, 20, 30, { x: 0, y: -20 });
    const sim = createKinematicPreviewSim(d);
    stepN(sim, 4 * STEPS_PER_S);
    const s = sim.snapshot();
    expect(s.jammed).toBe(true);
    for (const p of s.legPositions) for (const v of p) expect(Number.isFinite(v)).toBe(true);
    expect(Number.isFinite(s.body.position.y)).toBe(true);
  });

  it('works for single-leg presets and starts at the requested position', () => {
    for (const d of [chebyshevLambda(), fourBar()]) {
      const sim = createKinematicPreviewSim(d, undefined, { start: { x: -1, z: 0.3 } });
      const s0 = sim.snapshot();
      expect(s0.body.position.x).toBe(-1);
      expect(s0.body.position.z).toBe(0.3);
      stepN(sim, 3 * STEPS_PER_S);
      const s = sim.snapshot();
      expect(Number.isFinite(s.body.position.x)).toBe(true);
      expect(Number.isFinite(s.com.y)).toBe(true);
    }
  });
});
