import { describe, expect, it } from 'vitest';
import { createEmptyDesign } from '@/core/model/types';
import { fourBar, jansenWalker } from '@/core/model/presets';
import { basicLeg } from '@/game/designs';
import { createWalkerModel } from '../walker/walkerRig';
import {
  crankDirection,
  designExtent,
  fitScale,
  REFERENCE_EXTENT,
  stridePerRadian,
} from './miniature';

describe('模型の大きさ', () => {
  it('ヤンセン型の見本機はおよそ基準の大きさ', () => {
    const e = designExtent(jansenWalker());
    expect(e).toBeGreaterThan(REFERENCE_EXTENT * 0.6);
    expect(e).toBeLessThan(REFERENCE_EXTENT * 1.4);
  });

  it('縮尺を掛けると目標の大きさになる', () => {
    const d = basicLeg();
    expect(designExtent(d) * fitScale(d, 0.04)).toBeCloseTo(0.04, 9);
  });

  it('空の設計・極端な大きさでも縮尺は基準の 0.5〜2 倍に収まる', () => {
    const base = 0.04 / REFERENCE_EXTENT;
    expect(fitScale(createEmptyDesign(), 0.04)).toBe(base);
    const tiny = fourBar();
    tiny.joints = tiny.joints.map((j) => ({ ...j, x: j.x / 100, y: j.y / 100 }));
    expect(fitScale(tiny, 0.04)).toBeLessThanOrEqual(base * 2);
    const huge = fourBar();
    huge.joints = huge.joints.map((j) => ({ ...j, x: j.x * 100, y: j.y * 100 }));
    expect(fitScale(huge, 0.04)).toBeGreaterThanOrEqual(base * 0.5);
  });
});

describe('歩幅', () => {
  it('ヤンセン型はクランク 1 回転で数十 cm 進む', () => {
    const d = jansenWalker();
    const per = stridePerRadian(createWalkerModel(d), crankDirection(d));
    expect(per * 2 * Math.PI).toBeGreaterThan(20);
    expect(per * 2 * Math.PI).toBeLessThan(150);
  });

  it('脚先のない機構は 1(脚がそれなりに回る)', () => {
    const d = fourBar();
    d.foot = null;
    expect(stridePerRadian(createWalkerModel(d), crankDirection(d))).toBe(1);
  });

  it('回転数が 0 なら負の向きに回す', () => {
    const d = jansenWalker();
    d.motor.rpm = 0;
    expect(crankDirection(d)).toBe(-1);
  });
});
