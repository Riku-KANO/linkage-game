import { describe, expect, it } from 'vitest';
import {
  createGhostRecorder,
  decodeGhostCompact,
  encodeGhostCompact,
  ghostDuration,
  ghostFrameCount,
  GHOST_STRIDE,
  sampleGhost,
  validateGhost,
  type Ghost,
} from './ghost';
import { syntheticWalkGhost } from './ghostFixture';

const ident = { x: 0, y: 0, z: 0, w: 1 };

describe('ghost (MOD-3)', () => {
  it('records sim snapshots at a fixed rate', () => {
    const rec = createGhostRecorder(10);
    // 240Hz の固定ステップを 1 秒分
    for (let k = 0; k <= 240; k++) {
      const t = k / 240;
      rec.record({
        time: t,
        body: { position: { x: t, y: 0.3, z: 0 }, quaternion: ident },
        motorAngle: -2 * t,
      });
    }
    const g = rec.ghost();
    expect(g.hz).toBe(10);
    expect(ghostFrameCount(g)).toBe(11);
    expect(ghostDuration(g)).toBeCloseTo(1);
    expect(g.frames.slice(GHOST_STRIDE * 5, GHOST_STRIDE * 6)).toEqual([
      0.5, 0.3, 0, 0, 0, 0, 1, -1,
    ]);
    rec.reset();
    expect(ghostFrameCount(rec.ghost())).toBe(0);
  });

  it('repeats the last pose when snapshots skip sample times', () => {
    const rec = createGhostRecorder(10);
    rec.add(0, { x: 0, y: 0, z: 0 }, ident, 0);
    rec.add(0.35, { x: 1, y: 0, z: 0 }, ident, 0);
    // 0.1, 0.2, 0.3 の 3 フレームが 0.35 の姿勢で埋まる
    expect(ghostFrameCount(rec.ghost())).toBe(4);
    rec.add(0.4, { x: 2, y: 0, z: 0 }, ident, 0);
    expect(ghostFrameCount(rec.ghost())).toBe(5);
    rec.add(Number.NaN, { x: 2, y: 0, z: 0 }, ident, 0);
    expect(ghostFrameCount(rec.ghost())).toBe(5);
  });

  it('interpolates poses between frames and clamps outside the trace', () => {
    const q90 = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
    const g: Ghost = {
      hz: 2,
      frames: [0, 0, 0, 0, 0, 0, 1, 0, 2, 4, 6, q90.x, q90.y, q90.z, q90.w, 1],
    };
    const mid = sampleGhost(g, 0.25)!;
    expect(mid.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(mid.motorAngle).toBeCloseTo(0.5);
    // 45°回転
    expect(mid.quaternion.y).toBeCloseTo(Math.sin(Math.PI / 8), 2);
    expect(
      Math.hypot(mid.quaternion.x, mid.quaternion.y, mid.quaternion.z, mid.quaternion.w),
    ).toBeCloseTo(1);
    expect(sampleGhost(g, -5)!.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(sampleGhost(g, 99)!.position).toEqual({ x: 2, y: 4, z: 6 });
    expect(sampleGhost({ hz: 10, frames: [] }, 0)).toBeNull();
  });

  it('takes the short way between q and -q', () => {
    const g: Ghost = { hz: 1, frames: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, -1, 0] };
    const s = sampleGhost(g, 0.5)!;
    expect(Math.abs(s.quaternion.w)).toBeCloseTo(1);
  });

  it('round-trips through the quantized compact form', () => {
    const g = syntheticWalkGhost(30, 10);
    const back = decodeGhostCompact(JSON.parse(JSON.stringify(encodeGhostCompact(g))));
    expect(back).not.toBeNull();
    expect(back!.hz).toBe(10);
    expect(back!.frames.length).toBe(g.frames.length);
    for (let k = 0; k < ghostFrameCount(g); k++) {
      const o = k * GHOST_STRIDE;
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(back!.frames[o + c]! - g.frames[o + c]!)).toBeLessThanOrEqual(
          0.0005 + 1e-12,
        );
      }
      // q と -q は同じ回転
      let dot = 0;
      let na = 0;
      let nb = 0;
      for (let c = 3; c < 7; c++) {
        dot += back!.frames[o + c]! * g.frames[o + c]!;
        na += back!.frames[o + c]! ** 2;
        nb += g.frames[o + c]! ** 2;
      }
      expect(Math.abs(dot) / Math.sqrt(na * nb)).toBeGreaterThan(1 - 1e-5);
      expect(Math.abs(Math.sqrt(na) - 1)).toBeLessThan(2e-3);
      expect(Math.abs(back!.frames[o + 7]! - g.frames[o + 7]!)).toBeLessThanOrEqual(0.0005 + 1e-12);
    }
    // 量子化は冪等
    expect(encodeGhostCompact(back!)).toEqual(encodeGhostCompact(g));
  });

  it('rejects malformed ghosts', () => {
    const good = encodeGhostCompact(syntheticWalkGhost(1, 10));
    expect(decodeGhostCompact(good)).not.toBeNull();
    const bad: unknown[] = [
      null,
      'ghost',
      [],
      [0, [], []],
      [10, [1, 2], []],
      [10, [1, 1, 1, 1, 1, 1, 1, 1], [1, 2, 3]],
      [10, [1, 1, 1, 1, 1, 1, 1, 1], new Array(8).fill('x')],
      [10, [1, 1, 1, 1, 1, 1, 1, 1], new Array(8).fill(1e300)],
      [10, [3, 1, 1, 1, 1, 1, 1, 1], new Array(8).fill(0)],
    ];
    for (const v of bad) expect(decodeGhostCompact(v)).toBeNull();
    expect(validateGhost({ hz: 10, frames: [1, 2, 3] })).toBeNull();
    expect(validateGhost({ hz: -1, frames: [] })).toBeNull();
    expect(validateGhost({ hz: 10, frames: [0, 0, 0, 0, 0, 0, Number.NaN, 0] })).toBeNull();
    expect(validateGhost(syntheticWalkGhost(1, 10))).not.toBeNull();
  });
});
