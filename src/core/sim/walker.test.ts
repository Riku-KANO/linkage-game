import { describe, expect, it } from 'vitest';
import { Walker, createWalkerSim } from './walker';
import { createFlatTerrain } from './terrain';
import { runHeadless } from './headless';
import {
  awkwardFourBar,
  chebyshevWalker,
  jammingFourBar,
  jansenOneSided,
  jansenTwoSided,
} from './fixtures';
import { fourBar, jansenWalker } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';
import type { SimSnapshot } from './types';

const flat = createFlatTerrain(0);
const start = { x: 0, z: 0 };
const deg = (d: number) => (d * Math.PI) / 180;

function withRpm(design: DesignDoc, rpm: number): DesignDoc {
  return { ...design, motor: { rpm } };
}

function maxPenetration(snap: SimSnapshot, r: number, groundY = 0): number {
  let pen = 0;
  for (const c of snap.contacts) if (c.contact) pen = Math.max(pen, r - (c.position.y - groundY));
  return pen;
}

describe('settling (SIM-2)', () => {
  it('an unpowered Jansen walker comes to rest without bouncing or drifting', () => {
    const sim = new Walker({ design: withRpm(jansenWalker(), 0), terrain: flat, start });
    const r = sim.params.footRadius;
    let touched = false;
    let flights = 0;
    let at3: number[] = [];
    for (let s = 0; s < 6 * 240; s++) {
      sim.step();
      const snap = sim.snapshot();
      const any = snap.contacts.some((c) => c.contact);
      if (any) touched = true;
      else if (touched) flights++;
      if (s === 3 * 240) at3 = [...sim.com];
    }
    const snap = sim.snapshot();
    expect(touched).toBe(true);
    expect(flights).toBe(0); // never leaves the ground again
    expect(maxPenetration(snap, r)).toBeLessThan(0.01);
    expect(maxPenetration(snap, r)).toBeGreaterThan(0);
    expect(Math.hypot(...sim.vel)).toBeLessThan(1e-3);
    expect(Math.hypot(...sim.omega)).toBeLessThan(1e-3);
    // no drift between 3 s and 6 s
    expect(Math.hypot(sim.com[0]! - at3[0]!, sim.com[2]! - at3[2]!)).toBeLessThan(1e-3);
    expect(snap.fallen).toBe(false);
    expect(snap.motorSpeed).toBe(0);
    expect(snap.energy).toBe(0);
  });

  it('a two-sided Jansen walker settles level (< 1 cm penetration, < 1° tilt)', () => {
    const sim = new Walker({ design: withRpm(jansenTwoSided(), 0), terrain: flat, start });
    for (let s = 0; s < 3 * 240; s++) sim.step();
    const snap = sim.snapshot();
    expect(maxPenetration(snap, sim.params.footRadius)).toBeLessThan(0.01);
    expect(snap.tilt).toBeLessThan(deg(1));
    expect(Math.hypot(...sim.vel)).toBeLessThan(1e-3);
  });

  it('is placed upright with the lowest contact 1 mm above the terrain', () => {
    const terrain = createFlatTerrain(0.3);
    const snap = createWalkerSim({
      design: jansenWalker(),
      terrain,
      start: { x: 2, z: -1 },
    }).snapshot();
    const r = DEFAULT_RADIUS;
    const lowest = Math.min(...snap.contacts.map((c) => c.position.y));
    expect(lowest - r - 0.3).toBeCloseTo(0.001, 9);
    expect(snap.body.position.x).toBeCloseTo(2, 12);
    expect(snap.body.position.z).toBeCloseTo(-1, 12);
    expect(snap.body.quaternion).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(snap.tilt).toBe(0);
  });
});

const DEFAULT_RADIUS = 0.02;

describe('walking (SIM-5, milestone 2)', () => {
  it('the two-sided Jansen walker walks >= 2 m in +x within 20 s without falling', () => {
    const res = runHeadless(
      { design: jansenTwoSided(), terrain: flat, start },
      { maxTime: 20, stopOnFail: false },
    );
    expect(res.fallen).toBe(false);
    expect(res.jammed).toBe(false);
    expect(res.distance).toBeGreaterThan(2);
    expect(res.maxTilt).toBeLessThan(deg(5));
    // keeps going straight
    const last = res.trace[res.trace.length - 1]!;
    expect(Math.abs(last.position.z)).toBeLessThan(0.1 * res.distance);
  });

  it('reversing the motor walks in -x', () => {
    const res = runHeadless(
      { design: withRpm(jansenTwoSided(), 40), terrain: flat, start },
      { maxTime: 20, stopOnFail: false },
    );
    expect(res.fallen).toBe(false);
    expect(res.distance).toBeLessThan(-2);
  });

  it('walks faster at higher rpm', () => {
    const slow = runHeadless(
      { design: withRpm(jansenTwoSided(), -20), terrain: flat, start },
      { maxTime: 10 },
    );
    const fast = runHeadless(
      { design: withRpm(jansenTwoSided(), -60), terrain: flat, start },
      { maxTime: 10 },
    );
    expect(fast.distance).toBeGreaterThan(slow.distance * 2);
  });

  it('the one-sided 6-leg Jansen machine rests on a line of two feet and tips over', () => {
    // 片側 6 脚は、接地しているのが前後 1 本ずつだけ(支持が線)なので物理的に倒れる。
    // ここでは「倒れても転倒として検出され、数値が壊れない」ことだけを確かめる
    const res = runHeadless({ design: jansenOneSided(), terrain: flat, start }, { maxTime: 20 });
    expect(Number.isFinite(res.distance)).toBe(true);
    if (res.fallen) expect(res.maxTilt).toBeGreaterThan(deg(60));
  });
});

describe('stability across mechanisms (SIM-5)', () => {
  const machines: [string, DesignDoc][] = [
    ['jansen 6 legs (one-sided)', jansenOneSided()],
    ['jansen 12 legs', jansenTwoSided()],
    ['chebyshev 4 legs', chebyshevWalker()],
    ['awkward four-bar 6 legs', awkwardFourBar()],
    ['single four-bar leg', fourBar()],
  ];
  for (const [name, design] of machines) {
    for (const rpm of [design.motor.rpm, 120, -120]) {
      it(`${name} @ ${rpm} rpm: 20 s finite and bounded`, () => {
        const sim = new Walker({ design: withRpm(design, rpm), terrain: flat, start });
        let maxV = 0;
        let maxW = 0;
        let maxPen = 0;
        for (let s = 0; s < 20 * 240; s++) {
          sim.step();
          maxV = Math.max(maxV, Math.hypot(...sim.vel));
          maxW = Math.max(maxW, Math.hypot(...sim.omega));
          if (s % 24 === 0) {
            const snap = sim.snapshot();
            maxPen = Math.max(maxPen, maxPenetration(snap, sim.params.footRadius));
            for (const v of [...sim.com, ...sim.quat, sim.theta, sim.energy]) {
              expect(Number.isFinite(v)).toBe(true);
            }
            for (const c of snap.contacts) {
              expect(Number.isFinite(c.force.x + c.force.y + c.force.z)).toBe(true);
            }
          }
        }
        expect(Math.hypot(...sim.quat)).toBeCloseTo(1, 9);
        expect(maxV).toBeLessThan(5);
        expect(maxW).toBeLessThan(20);
        expect(maxPen).toBeLessThan(0.05);
        // stays on the ground (no launch)
        expect(sim.com[1]).toBeLessThan(2);
        expect(sim.com[1]).toBeGreaterThan(-0.1);
      });
    }
  }
});

describe('jamming (SIM-3)', () => {
  it('stops the motor when the mechanism can no longer be assembled', () => {
    const sim = new Walker({ design: jammingFourBar(), terrain: flat, start });
    for (let s = 0; s < 5 * 240; s++) sim.step();
    const a = sim.snapshot();
    expect(a.jammed).toBe(true);
    expect(a.motorSpeed).toBe(0);
    expect(a.stalled).toBe(false);
    for (let s = 0; s < 240; s++) sim.step();
    const b = sim.snapshot();
    expect(b.motorAngle).toBe(a.motorAngle);
    expect(Number.isFinite(b.com.x + b.com.y + b.com.z)).toBe(true);
  });
});

describe('snapshot (SIM-7)', () => {
  it('exposes contacts, COM projection, tilt and the legs', () => {
    const sim = new Walker({ design: jansenTwoSided(), terrain: flat, start });
    for (let s = 0; s < 240; s++) sim.step();
    const snap = sim.snapshot();
    // 12 legs × 6 moving joints + 8 chassis corners
    expect(snap.instances.length).toBe(12);
    expect(snap.legPositions.length).toBe(12);
    expect(snap.legPositions[0]!.length).toBe(16);
    expect(snap.contacts.length).toBe(12 * 6 + 8);
    expect(snap.contacts.filter((c) => c.instance === -1).length).toBe(8);
    const touching = snap.contacts.filter((c) => c.contact);
    expect(touching.length).toBeGreaterThanOrEqual(3);
    // ground reaction carries the weight (on average); here: upward and roughly m·g
    const fy = touching.reduce((a, c) => a + c.force.y, 0);
    expect(fy).toBeGreaterThan(0.5 * sim.mass.total * 9.81);
    expect(fy).toBeLessThan(1.5 * sim.mass.total * 9.81);
    expect(snap.comGround).toEqual({ x: snap.com.x, y: 0, z: snap.com.z });
    expect(snap.tilt).toBeLessThan(deg(5));
    expect(snap.time).toBeCloseTo(1, 9);
    expect(snap.motorSpeed).toBeLessThan(0);
    // body velocity is reported for the design origin
    expect(snap.body.velocity.x).toBeGreaterThan(0);
  });

  it('reset() restores the initial state', () => {
    const sim = createWalkerSim({ design: jansenTwoSided(), terrain: flat, start });
    const s0 = sim.snapshot();
    for (let s = 0; s < 300; s++) sim.step();
    sim.reset();
    expect(sim.snapshot()).toEqual(s0);
  });
});
