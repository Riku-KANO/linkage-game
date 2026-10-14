import { describe, expect, it } from 'vitest';
import { jansenWalker } from '@/core/model/presets';
import { createKinematicPreviewSim } from './previewSim';
import { copySnapshot, createEmptySnapshot, lerpSnapshot } from './snapshot';

describe('copySnapshot / lerpSnapshot', () => {
  const sim = createKinematicPreviewSim(jansenWalker());
  const a = copySnapshot(sim.snapshot(), createEmptySnapshot());
  for (let i = 0; i < 50; i++) sim.step();
  const b = copySnapshot(sim.snapshot(), createEmptySnapshot());

  it('deep-copies into reusable storage', () => {
    const out = createEmptySnapshot();
    copySnapshot(b, out);
    expect(out.legPositions).toHaveLength(b.legPositions.length);
    expect(out.legPositions[0]).not.toBe(b.legPositions[0]);
    expect(Array.from(out.legPositions[2]!)).toEqual(Array.from(b.legPositions[2]!));
    expect(out.contacts[3]!.position).not.toBe(b.contacts[3]!.position);
    expect(out.contacts[3]!.position).toEqual(b.contacts[3]!.position);
    // 2 回目は同じ配列を使い回す
    const keep = out.legPositions[0];
    copySnapshot(a, out);
    expect(out.legPositions[0]).toBe(keep);
    expect(out.time).toBe(a.time);
  });

  it('interpolates positions, angles and legs; flags come from b', () => {
    const out = createEmptySnapshot();
    lerpSnapshot(a, b, 0.25, out);
    expect(out.time).toBeCloseTo(a.time + 0.25 * (b.time - a.time));
    expect(out.motorAngle).toBeCloseTo(a.motorAngle + 0.25 * (b.motorAngle - a.motorAngle));
    expect(out.body.position.x).toBeCloseTo(
      a.body.position.x + 0.25 * (b.body.position.x - a.body.position.x),
    );
    const q = out.body.quaternion;
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1);
    const k = 1;
    const i = 7;
    expect(out.legPositions[k]![i]).toBeCloseTo(
      a.legPositions[k]![i]! + 0.25 * (b.legPositions[k]![i]! - a.legPositions[k]![i]!),
    );
    expect(out.contacts.map((c) => c.contact)).toEqual(b.contacts.map((c) => c.contact));
  });

  it('clamps t and falls back to b when shapes differ', () => {
    const out = createEmptySnapshot();
    lerpSnapshot(a, b, 1, out);
    expect(out.time).toBe(b.time);
    lerpSnapshot(a, b, -1, out);
    expect(out.time).toBe(a.time);
    lerpSnapshot(createEmptySnapshot(), b, 0.5, out);
    expect(out.time).toBe(b.time);
    expect(out.legPositions).toHaveLength(b.legPositions.length);
  });
});
