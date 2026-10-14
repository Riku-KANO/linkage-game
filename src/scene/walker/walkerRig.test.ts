import { describe, expect, it } from 'vitest';
import { jansenWalker } from '@/core/model/presets';
import {
  TURN_DURATION,
  WalkerGait,
  createPacer,
  createWalkerModel,
  layerOffset,
  poseWalker,
  updatePacer,
} from './walkerRig';

describe('見本機のモデル', () => {
  const model = createWalkerModel(jansenWalker());

  it('ヤンセン型見本機:前後反転ペア 3 組で 6 脚、棒 66 本、ピン 48 本', () => {
    expect(model.legs).toHaveLength(6);
    expect(model.legs.filter((l) => l.mirrored)).toHaveLength(3);
    expect(model.bars).toHaveLength(66);
    expect(model.pins).toHaveLength(48);
    expect(model.footIndex).toBeGreaterThanOrEqual(0);
  });

  it('機体フレームは固定点を囲み、全ての脚の奥行きを含む', () => {
    expect(model.frame.xMin).toBeLessThan(-38);
    expect(model.frame.xMax).toBeGreaterThan(38);
    expect(model.frame.zMin).toBeLessThan(-55);
    expect(model.frame.zMax).toBeGreaterThan(55);
  });

  it('層はリンクごとに奥行きをずらし、中央対称', () => {
    expect(layerOffset(model, 0)).toBeCloseTo(-layerOffset(model, model.layers - 1), 9);
  });

  it('全周で組み立てられる', () => {
    const m = createWalkerModel(jansenWalker());
    for (let k = 0; k <= 72; k++) expect(poseWalker(m, -(k / 72) * Math.PI * 2)).toBe(true);
  });
});

describe('歩容', () => {
  it('クランクを時計回りに 1 回転すると前へ 1m 以上進み、ほとんど後ずさりしない', () => {
    const m = createWalkerModel(jansenWalker());
    const gait = new WalkerGait(m);
    let total = 0;
    let worst = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    const steps = 360;
    for (let i = 0; i < steps; i++) {
      const { advance, minFootY } = gait.step((-2 * Math.PI) / steps);
      total += advance;
      worst = Math.min(worst, advance);
      minY = Math.min(minY, minFootY);
      maxY = Math.max(maxY, minFootY);
    }
    expect(total).toBeGreaterThan(100);
    expect(worst).toBeGreaterThan(-1);
    // 機体の上下動は小さい(接地側の脚先がほぼ水平に動く)
    expect(maxY - minY).toBeLessThan(3);
  });
});

describe('行ったり来たり', () => {
  const bounds = { xMin: 0.2, xMax: 0.95, z: -0.95 };

  it('範囲を大きく外れず、端で回れ右する', () => {
    const s = createPacer(bounds);
    const headings = new Set<number>();
    for (let i = 0; i < 60 * 60; i++) {
      updatePacer(s, 0.08 / 60, 1 / 60, bounds);
      expect(s.x).toBeGreaterThan(bounds.xMin - 0.1);
      expect(s.x).toBeLessThan(bounds.xMax + 0.1);
      expect(Math.abs(s.z - bounds.z)).toBeLessThan(0.1);
      if (s.mode === 'walk') headings.add(Math.round(Math.cos(s.heading)));
    }
    expect(headings.has(1)).toBe(true);
    expect(headings.has(-1)).toBe(true);
  });

  it('持ち上げて範囲の外・斜め向きに置いても戻ってくる', () => {
    const s = createPacer(bounds);
    s.x = 1.3;
    s.z = -0.7;
    s.heading = 0.6;
    for (let i = 0; i < 60 * 40; i++) updatePacer(s, 0.08 / 60, 1 / 60, bounds);
    expect(s.x).toBeGreaterThan(bounds.xMin - 0.1);
    expect(s.x).toBeLessThan(bounds.xMax + 0.1);
    expect(Math.abs(s.z - bounds.z)).toBeLessThan(0.05);
  });

  it('回れ右は TURN_DURATION で終わる', () => {
    const s = createPacer(bounds);
    s.x = bounds.xMax + 0.01;
    updatePacer(s, 0, 1 / 60, bounds);
    expect(s.mode).toBe('turn');
    for (let t = 0; t < TURN_DURATION + 0.05; t += 1 / 60) updatePacer(s, 0, 1 / 60, bounds);
    expect(s.mode).toBe('walk');
    expect(Math.cos(s.heading)).toBeCloseTo(-1, 6);
  });
});
